import { isCanonicalCourseId } from "./courseAuthoringRoute.js";
import {
  normalizeCourseSourceChange as normalizeCourseSourceChangeDomain,
  normalizeCourseSourceLinks,
  normalizeCourseSourcesRead
} from "../domain/courseSources.js";
import {
  CourseDesignParametersError,
  normalizeCourseDesignRead as normalizeCourseDesignReadDomain,
  normalizeCourseDesignChange as normalizeCourseDesignChangeDomain
} from "../domain/courseDesignParameters.js";

const OWNERSHIP_VALUES = new Set(["owned"]);
const AUTHORING_PLAN_ORIGINS = new Set(["automatic", "author", "research_condition"]);
const PART_PROGRESS_STATES = new Set([
  "planned", "partially_materialized", "materialized"
]);
const CURRICULUM_MAP_STATES = new Set(["absent", "draft", "approved"]);
const CURRICULUM_SCOPE_STATES = new Set(["planned", "developed"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
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
  if (parsed === null) fail("invalid_course_projection", "A versão do curso é inválida.");
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
  if (normalized === "shared" || normalized === "public") {
    fail("course_not_owned", "Somente cursos próprios pertencem à autoria.");
  }
  if (!OWNERSHIP_VALUES.has(normalized)) {
    fail("invalid_course_projection", "O tipo de acesso ao curso é inválido.");
  }
  return normalized;
}

function editCapability(value, normalizedOwnership) {
  if (!normalizedOwnership) return null;
  const expected = normalizedOwnership === "owned";
  if (typeof value === "boolean" && value !== expected) {
    fail("invalid_course_projection", "A propriedade e a edição do curso são inconsistentes.");
  }
  return expected;
}

function courseAccessPolicy(value) {
  const visibility = value.visibility ?? null;
  const publicFileAccess = value.publicFileAccess ?? null;
  if ((visibility !== null && !["private", "public"].includes(visibility)) ||
      (publicFileAccess !== null && !["restricted", "available"].includes(publicFileAccess))) {
    fail("invalid_course_projection", "A política de acesso do curso é inválida.");
  }
  return { visibility, publicFileAccess };
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
    fail("invalid_course_projection", "As contagens do curso são inválidas.");
  }
  return Object.freeze(Object.fromEntries(entries));
}

function normalizeListItem(value) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "A lista contém um curso inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title) {
    fail("invalid_course_projection", "A lista contém um curso sem identidade ou título válido.");
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
    ...courseAccessPolicy(value),
    counts: courseCounts(isPlainObject(value.counts) ? value.counts : value),
    updatedAt: text(value.updatedAt) || null,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function normalizeCourseListPage(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items)) {
    fail("invalid_course_projection", "A página de cursos é inválida.");
  }
  const items = value.items.map(normalizeListItem);
  const identities = new Set(items.map((item) => item.courseId));
  if (identities.size !== items.length) {
    fail("invalid_course_projection", "A página repete a identidade de um curso.");
  }
  const pagination = pageState(value);
  if (items.length === 0 && pagination.hasMore) {
    fail("invalid_course_cursor", "A página vazia não pode indicar continuação.");
  }
  return Object.freeze({
    items: Object.freeze(items),
    ...pagination,
    offline: value.offline === true,
    stale: value.stale === true,
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
    offline: incoming.offline,
    stale: incoming.stale,
    offlineKnown: current?.offlineKnown === true || incoming.offlineKnown
  });
}

export function normalizeCourseDetail(value, { expectedCourseId = "" } = {}) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "O curso devolvido é inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title ||
      (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_course_projection", "O curso devolvido não corresponde ao solicitado.");
  }
  const normalizedOwnership = ownership(value.ownership);
  return Object.freeze({
    courseId,
    title,
    goal: text(value.goal) || null,
    revision: revision(value.revision),
    ownership: normalizedOwnership,
    canEdit: editCapability(value.canEdit, normalizedOwnership),
    ...courseAccessPolicy(value),
    counts: courseCounts(value.counts),
    updatedAt: text(value.updatedAt) || null,
    offline: value.offline === true,
    stale: value.stale === true,
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
    fail("invalid_authoring_plan", "A faixa preferencial de partes é inválida.");
  }
  const minimum = boundedNaturalNumber(value.minimum, "O mínimo de partes", {
    minimum: 1,
    maximum: 64
  });
  const maximum = boundedNaturalNumber(value.maximum, "O máximo de partes", {
    minimum: 1,
    maximum: 64
  });
  const origin = text(value.origin);
  if (minimum > maximum || !AUTHORING_PLAN_ORIGINS.has(origin)) {
    fail("invalid_authoring_plan", "A faixa preferencial de partes é inconsistente.");
  }
  return Object.freeze({ minimum, maximum, origin });
}

function normalizeCurriculumMicrosequence(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "Uma microssequência do mapa curricular é inválida.");
  }
  const role = optionalText(value.role, "A função da microssequência", { maximum: 20 });
  if (role && !MICROSEQUENCE_ROLES.has(role)) {
    fail("invalid_authoring_plan", "A função da microssequência é inválida.");
  }
  if (!Array.isArray(value.dependencyMicrosequenceIds) ||
      value.dependencyMicrosequenceIds.length > 64) {
    fail("invalid_authoring_plan", "As dependências da microssequência são inválidas.");
  }
  const dependencyMicrosequenceIds = value.dependencyMicrosequenceIds.map((id) =>
    requiredText(id, "A dependência da microssequência", { maximum: 240 }));
  if (new Set(dependencyMicrosequenceIds).size !== dependencyMicrosequenceIds.length) {
    fail("invalid_authoring_plan", "A microssequência repete uma dependência.");
  }
  return Object.freeze({
    id: requiredText(value.id, "A identidade da microssequência", { maximum: 240 }),
    position: boundedNaturalNumber(value.position, "A posição da microssequência", {
      maximum: 511
    }),
    title: requiredText(value.title, "O título da microssequência", { maximum: 300 }),
    objective: optionalText(value.objective, "O objetivo da microssequência", { maximum: 4_000 }),
    dependencyMicrosequenceIds: Object.freeze(dependencyMicrosequenceIds),
    role
  });
}

function normalizedCurriculumChildren(value, normalizeItem, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail("invalid_authoring_plan", `${label} do mapa curricular são inválidas.`);
  }
  const items = value.map(normalizeItem).sort((left, right) => left.position - right.position);
  if (new Set(items.map(({ id }) => id)).size !== items.length ||
      items.some((item, position) => item.position !== position)) {
    fail("invalid_authoring_plan", `A ordem de ${label.toLowerCase()} é inconsistente.`);
  }
  return Object.freeze(items);
}

function normalizeCurriculumLesson(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "Uma lição do mapa curricular é inválida.");
  }
  return Object.freeze({
    id: requiredText(value.id, "A identidade da lição", { maximum: 240 }),
    position: boundedNaturalNumber(value.position, "A posição da lição", { maximum: 511 }),
    title: requiredText(value.title, "O título da lição", { maximum: 300 }),
    objective: optionalText(value.objective, "O objetivo da lição", { maximum: 4_000 }),
    microsequences: normalizedCurriculumChildren(
      value.microsequences,
      normalizeCurriculumMicrosequence,
      "Microssequências",
      512
    )
  });
}

function normalizeCurriculumModule(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "Um módulo do mapa curricular é inválido.");
  }
  return Object.freeze({
    id: requiredText(value.id, "A identidade do módulo", { maximum: 240 }),
    position: boundedNaturalNumber(value.position, "A posição do módulo", { maximum: 127 }),
    title: requiredText(value.title, "O título do módulo", { maximum: 300 }),
    objective: optionalText(value.objective, "O objetivo do módulo", { maximum: 4_000 }),
    lessons: normalizedCurriculumChildren(
      value.lessons,
      normalizeCurriculumLesson,
      "Lições",
      512
    )
  });
}

function normalizeCurriculum(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "O mapa curricular é inválido.");
  }
  const modules = normalizedCurriculumChildren(
    value.modules,
    normalizeCurriculumModule,
    "Módulos",
    128
  );
  const lessons = modules.flatMap((module) => module.lessons);
  const microsequences = lessons.flatMap((lesson) => lesson.microsequences);
  if (new Set(lessons.map(({ id }) => id)).size !== lessons.length ||
      new Set(microsequences.map(({ id }) => id)).size !== microsequences.length) {
    fail("invalid_authoring_plan", "O mapa curricular repete identidades.");
  }
  const positionByMicrosequenceId = new Map(microsequences.map((item, position) => [
    item.id, position
  ]));
  for (const [position, microsequence] of microsequences.entries()) {
    if (microsequence.dependencyMicrosequenceIds.some((id) =>
      !positionByMicrosequenceId.has(id) || positionByMicrosequenceId.get(id) >= position)) {
      fail(
        "invalid_authoring_plan",
        "Uma dependência precisa apontar para uma microssequência anterior do mapa."
      );
    }
  }
  return Object.freeze({ modules });
}

function normalizeDeclaredPrerequisites(value) {
  if (!Array.isArray(value) || value.length > 64) {
    fail("invalid_authoring_plan", "Os pré-requisitos declarados são inválidos.");
  }
  const prerequisites = value.map((item) =>
    requiredText(item, "Um pré-requisito declarado", { maximum: 2_000 }));
  if (new Set(prerequisites.map((item) => item.toLocaleLowerCase("pt-BR"))).size !==
      prerequisites.length) {
    fail("invalid_authoring_plan", "Os pré-requisitos declarados se repetem.");
  }
  return Object.freeze(prerequisites);
}

function curriculumIndex(curriculum) {
  const modules = new Map();
  const lessons = new Map();
  const microsequences = new Map();
  for (const module of curriculum.modules) {
    modules.set(module.id, module);
    for (const lesson of module.lessons) {
      lessons.set(lesson.id, { module, lesson });
      for (const microsequence of lesson.microsequences) {
        microsequences.set(microsequence.id, { module, lesson, microsequence });
      }
    }
  }
  return { modules, lessons, microsequences };
}

function normalizeStudyUnitReference(value, label) {
  if (!isPlainObject(value)) fail("invalid_authoring_plan", `${label} é inválida.`);
  return Object.freeze({
    studyUnitId: requiredText(value.studyUnitId, `A unidade de estudo de ${label.toLowerCase()}`, {
      maximum: 240
    }),
    didacticMicrosequenceId: requiredText(
      value.didacticMicrosequenceId,
      `A microssequência de ${label.toLowerCase()}`,
      { maximum: 240 }
    ),
    title: requiredText(value.title, `O título de ${label.toLowerCase()}`, { maximum: 300 })
  });
}

function normalizeCurriculumTarget(value, index) {
  if (!isPlainObject(value) || !Array.isArray(value.didacticMicrosequenceIds) ||
      value.didacticMicrosequenceIds.length === 0 ||
      value.didacticMicrosequenceIds.length > 512) {
    fail("invalid_authoring_plan", "Um destino da cobertura curricular é inválido.");
  }
  const moduleId = requiredText(value.moduleId, "O módulo da cobertura", { maximum: 240 });
  const lessonId = requiredText(value.lessonId, "A lição da cobertura", { maximum: 240 });
  const path = index.lessons.get(lessonId);
  if (!path || path.module.id !== moduleId) {
    fail("invalid_authoring_plan", "Um destino da cobertura não pertence ao mapa curricular.");
  }
  const didacticMicrosequenceIds = value.didacticMicrosequenceIds.map((id) =>
    requiredText(id, "A microssequência da cobertura", { maximum: 240 }));
  if (new Set(didacticMicrosequenceIds).size !== didacticMicrosequenceIds.length ||
      didacticMicrosequenceIds.some((id) => {
        const microsequencePath = index.microsequences.get(id);
        return !microsequencePath || microsequencePath.lesson.id !== lessonId;
      })) {
    fail("invalid_authoring_plan", "As microssequências da cobertura são inconsistentes.");
  }
  return Object.freeze({ moduleId, lessonId, didacticMicrosequenceIds: Object.freeze(
    didacticMicrosequenceIds
  ) });
}

function normalizeCurriculumScopeItems(value, curriculum) {
  if (!Array.isArray(value) || value.length > 512) {
    fail("invalid_authoring_plan", "A cobertura do escopo curricular é inválida.");
  }
  const index = curriculumIndex(curriculum);
  const items = value.map((item) => {
    if (!isPlainObject(item) || !Array.isArray(item.curriculumTargets) ||
        !Array.isArray(item.developedIn ?? [])) {
      fail("invalid_authoring_plan", "Um item da cobertura do escopo é inválido.");
    }
    const state = text(item.state);
    if (!CURRICULUM_SCOPE_STATES.has(state)) {
      fail("invalid_authoring_plan", "O estado da cobertura do escopo é inválido.");
    }
    const developedIn = (item.developedIn ?? []).map((reference) =>
      normalizeStudyUnitReference(reference, "A referência de desenvolvimento"));
    if (developedIn.some(({ didacticMicrosequenceId }) =>
      !index.microsequences.has(didacticMicrosequenceId))) {
      fail("invalid_authoring_plan", "Uma referência de desenvolvimento saiu do mapa curricular.");
    }
    return Object.freeze({
      id: uuid(item.id, "A identidade do item de cobertura"),
      position: boundedNaturalNumber(item.position, "A posição do item de cobertura", {
        maximum: 511
      }),
      statement: requiredText(item.statement, "O enunciado do item de cobertura", {
        maximum: 2_000
      }),
      state,
      curriculumTargets: Object.freeze(item.curriculumTargets.map((target) =>
        normalizeCurriculumTarget(target, index))),
      developedIn: Object.freeze(developedIn)
    });
  }).sort((left, right) => left.position - right.position);
  if (new Set(items.map(({ id }) => id)).size !== items.length ||
      items.some((item, position) => item.position !== position)) {
    fail("invalid_authoring_plan", "A ordem da cobertura do escopo é inconsistente.");
  }
  return Object.freeze(items);
}

function normalizePartMicrosequence(value) {
  if (!isPlainObject(value) || !isPlainObject(value.curriculumPath)) {
    fail("invalid_authoring_plan", "Um vínculo de parte é inválido.");
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
    goal: requiredText(value.goal, "O objetivo da microssequência", { maximum: 4_000 }),
    role: (() => {
      const role = requiredText(value.role, "A função da microssequência", { maximum: 20 });
      if (!MICROSEQUENCE_ROLES.has(role)) {
        fail("invalid_authoring_plan", "A função da microssequência é inválida.");
      }
      return role;
    })(),
    curriculumPath: Object.freeze({
      moduleId: requiredText(value.curriculumPath.moduleId, "O módulo da microssequência", {
        maximum: 240
      }),
      moduleTitle: requiredText(
        value.curriculumPath.moduleTitle,
        "O título do módulo",
        { maximum: 300 }
      ),
      lessonId: requiredText(value.curriculumPath.lessonId, "A lição da microssequência", {
        maximum: 240
      }),
      lessonTitle: requiredText(
        value.curriculumPath.lessonTitle,
        "O título da lição",
        { maximum: 300 }
      )
    }),
    studyUnitCount: boundedNaturalNumber(value.studyUnitCount, "A quantidade de unidades")
  });
}

function normalizePartProgress(value) {
  if (!isPlainObject(value) ||
      Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, "state") ||
      !Object.hasOwn(value, "microsequenceCount") ||
      !Object.hasOwn(value, "studyUnitCount")) {
    fail("invalid_authoring_plan", "O progresso de uma parte é inválido.");
  }
  const state = text(value.state);
  if (!PART_PROGRESS_STATES.has(state)) {
    fail("invalid_authoring_plan", "O estado derivado de uma parte é inválido.");
  }
  return Object.freeze({
    state,
    microsequenceCount: boundedNaturalNumber(
      value.microsequenceCount,
      "A quantidade de microssequências"
    ),
    studyUnitCount: boundedNaturalNumber(
      value.studyUnitCount,
      "A quantidade de unidades"
    )
  });
}

function normalizeCoursePart(value) {
  if (!isPlainObject(value) || !Array.isArray(value.microsequences) ||
      !Array.isArray(value.progression) || value.progression.length > 64 ||
      value.microsequences.length > 500) {
    fail("invalid_authoring_plan", "Uma parte de autoria é inválida.");
  }
  const microsequences = value.microsequences.map(normalizePartMicrosequence);
  if (new Set(microsequences.map((item) => item.id)).size !== microsequences.length ||
      microsequences.some((item, position) => item.productionPosition !== position)) {
    fail("invalid_authoring_plan", "Uma parte repete a mesma microssequência.");
  }
  const progress = normalizePartProgress(value.progress);
  const studyUnitCount = microsequences.reduce(
    (total, microsequence) => total + microsequence.studyUnitCount,
    0
  );
  if (progress.microsequenceCount !== microsequences.length ||
      progress.studyUnitCount !== studyUnitCount) {
    fail("invalid_authoring_plan", "O progresso da parte não corresponde ao conteúdo vivo.");
  }
  const progression = value.progression.map((item) =>
    requiredText(item, "Uma etapa da progressão local", { maximum: 1_000 }));
  return Object.freeze({
    id: uuid(value.id, "A identidade da parte"),
    title: requiredText(value.title, "O título da parte", { maximum: 300 }),
    intent: optionalText(value.intent, "A intenção da parte", { maximum: 4_000 }),
    version: boundedNaturalNumber(value.version, "A versão da parte", { minimum: 1 }),
    position: boundedNaturalNumber(value.position, "A posição da parte", { maximum: 63 }),
    progression: Object.freeze(progression),
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
    version: boundedNaturalNumber(value.version, "A versão do item", { minimum: 1 }),
    sourceLinks: Object.freeze(normalizeCourseSourceLinks(value.sourceLinks ?? []))
  });
}

function normalizeAnalysisPlanItem(value, label) {
  const item = normalizePlanItem(value, label);
  const introducedAt = value.introducedAt == null
    ? null
    : normalizeStudyUnitReference(value.introducedAt, "A introdução da unidade de análise");
  if (!Array.isArray(value.usedBy) || !Array.isArray(value.revisitedBy)) {
    fail("invalid_authoring_plan", "As referências da unidade de análise são inválidas.");
  }
  return Object.freeze({
    ...item,
    description: optionalText(value.description, "A descrição da unidade de análise", {
      maximum: 2_000
    }),
    introducedAt,
    usedBy: Object.freeze(value.usedBy.map((reference) =>
      normalizeStudyUnitReference(reference, "Uma utilização da unidade de análise"))),
    revisitedBy: Object.freeze(value.revisitedBy.map((reference) =>
      normalizeStudyUnitReference(reference, "Uma retomada da unidade de análise")))
  });
}

function normalizePlanItemList(value, label, normalizeItem = normalizePlanItem) {
  if (!Array.isArray(value) || value.length > 512) {
    fail("invalid_authoring_plan", `A lista de ${label.toLowerCase()} é inválida.`);
  }
  const items = value.map((item) => normalizeItem(item, label))
    .sort((left, right) => left.position - right.position);
  if (new Set(items.map((item) => item.id)).size !== items.length ||
      new Set(items.map((item) => item.position)).size !== items.length) {
    fail("invalid_authoring_plan", `A ordem de ${label.toLowerCase()} é inconsistente.`);
  }
  return Object.freeze(items.map((item, position) => Object.freeze({
    ...item,
    position
  })));
}


export function normalizeCourseAuthoringPlan(value, {
  expectedCourseId = "",
  expectedCourseRevision = null
} = {}) {
  if (!isPlainObject(value) || value.contract !== "aralearn.course-instructional-plan.v3" ||
      !isPlainObject(value.plan) ||
      !isPlainObject(value.plan.curriculum) ||
      !Array.isArray(value.plan.curriculumScopeItems) ||
      !Array.isArray(value.plan.intendedLearningOutcomes) ||
      !Array.isArray(value.plan.instructionalAnalysisUnits) ||
      !Array.isArray(value.plan.evidenceRequirements) ||
      !Array.isArray(value.plan.parts) || value.plan.parts.length > 64) {
    fail("invalid_authoring_plan", "O planejamento de autoria devolvido é inválido.");
  }
  const courseId = text(value.courseId).toLowerCase();
  const courseRevision = revision(value.courseRevision);
  if (!isCanonicalCourseId(courseId) || (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_authoring_plan", "O planejamento pertence a outro curso.");
  }
  if (expectedCourseRevision !== null && courseRevision !== expectedCourseRevision) {
    fail("course_revision_changed", "O curso mudou durante a leitura do planejamento.");
  }
  const curriculumMapStatus = text(value.plan.curriculumMapStatus);
  if (!CURRICULUM_MAP_STATES.has(curriculumMapStatus)) {
    fail("invalid_authoring_plan", "A situação do mapa curricular é inválida.");
  }
  const declaredPrerequisites = normalizeDeclaredPrerequisites(
    value.plan.declaredPrerequisites
  );
  const curriculum = normalizeCurriculum(value.plan.curriculum);
  const indexedCurriculum = curriculumIndex(curriculum);
  const curriculumScopeItems = normalizeCurriculumScopeItems(
    value.plan.curriculumScopeItems,
    curriculum
  );
  const parts = value.plan.parts.map(normalizeCoursePart)
    .sort((left, right) => left.position - right.position);
  if (new Set(parts.map((part) => part.id)).size !== parts.length ||
      parts.some((part, position) => part.position !== position)) {
    fail("invalid_authoring_plan", "A ordem das partes é inconsistente.");
  }
  const linkedMicrosequenceIds = parts.flatMap((part) =>
    part.microsequences.map((item) => item.id));
  if (linkedMicrosequenceIds.length > 192) {
    fail("invalid_authoring_plan", "O planejamento excede 192 vínculos de microssequência.");
  }
  if (new Set(linkedMicrosequenceIds).size !== linkedMicrosequenceIds.length) {
    fail("invalid_authoring_plan", "Uma microssequência está vinculada a mais de uma parte.");
  }
  for (const part of parts) {
    for (const linked of part.microsequences) {
      const path = indexedCurriculum.microsequences.get(linked.id);
      if (!path || path.module.id !== linked.curriculumPath.moduleId ||
          path.module.title !== linked.curriculumPath.moduleTitle ||
          path.lesson.id !== linked.curriculumPath.lessonId ||
          path.lesson.title !== linked.curriculumPath.lessonTitle ||
          path.microsequence.title !== linked.title ||
          (path.microsequence.objective && path.microsequence.objective !== linked.goal) ||
          (path.microsequence.role && path.microsequence.role !== linked.role)) {
        fail("invalid_authoring_plan", "Um lote de produção diverge do mapa curricular.");
      }
    }
  }
  const intendedLearningOutcomes = normalizePlanItemList(
    value.plan.intendedLearningOutcomes,
    "Resultados de aprendizagem"
  );
  const instructionalAnalysisUnits = normalizePlanItemList(
    value.plan.instructionalAnalysisUnits,
    "Unidades de análise instrucional",
    normalizeAnalysisPlanItem
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
  return Object.freeze({
    courseId,
    courseRevision,
    plan: Object.freeze({
      id: uuid(value.plan.id, "A identidade do planejamento"),
      version: boundedNaturalNumber(value.plan.version, "A versão do planejamento", {
        minimum: 1
      }),
      title: requiredText(value.plan.title, "O título do curso", { maximum: 300 }),
      objective: requiredText(value.plan.objective, "O objetivo do curso", { maximum: 2_000 }),
      audience: optionalText(value.plan.audience, "O público", { maximum: 4_000 }),
      scope: optionalText(value.plan.scope, "O escopo", { maximum: 8_000 }),
      curriculumMapStatus,
      declaredPrerequisites,
      curriculum,
      curriculumScopeItems,
      updatedAt: dateTime(value.plan.updatedAt, "A atualização do planejamento"),
      preferredPartCount: normalizePreferredPartCount(value.plan.preferredPartCount),
      intendedLearningOutcomes,
      instructionalAnalysisUnits,
      evidenceRequirements,
      parts: Object.freeze(parts),
      counts
    })
  });
}

export function projectCoursePlanning(course, authoringPlan) {
  if (!isPlainObject(course) || !isPlainObject(authoringPlan) ||
      course.courseId !== authoringPlan.courseId ||
      course.revision !== authoringPlan.courseRevision ||
      course.title !== authoringPlan.plan.title ||
      (text(course.goal) || null) !== authoringPlan.plan.objective) {
    fail("invalid_authoring_plan", "O planejamento não corresponde ao curso aberto.");
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
    curriculumMapStatus: authoringPlan.plan.curriculumMapStatus,
    declaredPrerequisites: authoringPlan.plan.declaredPrerequisites,
    curriculum: authoringPlan.plan.curriculum,
    curriculumScopeItems: authoringPlan.plan.curriculumScopeItems,
    updatedAt: authoringPlan.plan.updatedAt,
    preferredPartCount: authoringPlan.plan.preferredPartCount,
    parts: Object.freeze(parts),
    linkedMicrosequenceCount: authoringPlan.plan.counts.linkedDidacticMicrosequenceCount,
    studyUnitCount: authoringPlan.plan.counts.studyUnitCount,
    intendedLearningOutcomes: authoringPlan.plan.intendedLearningOutcomes,
    instructionalAnalysisUnits: authoringPlan.plan.instructionalAnalysisUnits,
    evidenceRequirements: authoringPlan.plan.evidenceRequirements,
    counts: authoringPlan.plan.counts
  });
}

function designFail(message) {
  fail("invalid_course_design", message);
}

function scopeIdentity(value) {
  return `${value.kind}:${value.ref}`;
}

function normalizeDesignDomain(normalizer, value) {
  try {
    return normalizer(value);
  } catch (error) {
    if (error instanceof CourseDesignParametersError) designFail(error.message);
    throw error;
  }
}

export function normalizeCourseDesign(value, {
  expectedCourseId = "",
  expectedCourseRevision = null,
  expectedScope = null
} = {}) {
  const design = normalizeDesignDomain(normalizeCourseDesignReadDomain, value);
  if (expectedCourseRevision !== null && design.courseRevision !== expectedCourseRevision) {
    fail("course_revision_changed", "O curso mudou durante a leitura do desenho pedagógico.");
  }
  if (expectedCourseId && design.courseId !== expectedCourseId || expectedScope &&
      scopeIdentity(design.scopeContext.current) !== scopeIdentity(expectedScope)) {
    designFail("O desenho não corresponde ao curso e escopo solicitados.");
  }
  return Object.freeze(design);
}

export function normalizeCourseDesignChange(value, {
  expectedCourseId = "",
  expectedRequestId = ""
} = {}) {
  const change = normalizeDesignDomain(normalizeCourseDesignChangeDomain, value);
  if (expectedCourseId && change.courseId !== expectedCourseId ||
      expectedRequestId && change.requestId !== expectedRequestId) {
    designFail("A confirmação não corresponde à mudança de desenho solicitada.");
  }
  return Object.freeze(change);
}

export function mergeCourseDesignScopePages(currentValue, incomingValue) {
  const current = normalizeCourseDesign(currentValue);
  const incoming = normalizeCourseDesign(incomingValue, {
    expectedCourseId: current.courseId,
    expectedCourseRevision: current.courseRevision,
    expectedScope: {
      kind: current.scopeContext.current.kind,
      ref: current.scopeContext.current.ref
    }
  });
  const stable = (value) => JSON.stringify(value);
  const comparable = (value) => ({
    ...value,
    scopeContext: {
      ...value.scopeContext,
      children: [],
      hasMoreChildren: false,
      nextChildCursor: null
    }
  });
  if (stable(comparable(current)) !== stable(comparable(incoming))) {
    designFail("As páginas do desenho pertencem a leituras diferentes.");
  }
  const children = [...current.scopeContext.children, ...incoming.scopeContext.children]
    .sort((left, right) => left.position - right.position);
  if (new Set(children.map(scopeIdentity)).size !== children.length ||
      children.length > current.scopeContext.childCount) {
    designFail("A paginação do desenho repetiu um subescopo.");
  }
  return Object.freeze({
    ...incoming,
    scopeContext: Object.freeze({
      ...incoming.scopeContext,
      children: Object.freeze(children)
    })
  });
}

export function normalizeCourseSourcesPage(value, {
  expectedCourseId = "",
  expectedCourseRevision = null,
  expectedMode = "",
  expectedSourceId = null,
  expectedTargetKind = null,
  expectedTargetId = null
} = {}) {
  const normalized = normalizeCourseSourcesRead(value);
  if ((expectedCourseId && normalized.courseId !== expectedCourseId) ||
      (expectedCourseRevision !== null &&
       normalized.courseRevision !== expectedCourseRevision)) {
    fail("course_revision_changed", "O curso mudou durante a leitura de fontes.");
  }
  if ((expectedMode && normalized.mode !== expectedMode) ||
      (expectedSourceId !== null && normalized.query.sourceId !== expectedSourceId) ||
      (expectedTargetKind !== null && normalized.query.targetKind !== expectedTargetKind) ||
      (expectedTargetId !== null && normalized.query.targetId !== expectedTargetId)) {
    fail("invalid_course_sources", "A leitura de fontes não corresponde à consulta solicitada.");
  }
  return normalized;
}

export function mergeCourseSourceCatalogPages(currentValue, incomingValue) {
  const incoming = normalizeCourseSourcesPage(incomingValue, {
    expectedCourseId: currentValue?.courseId || "",
    expectedCourseRevision: currentValue?.courseRevision ?? null,
    expectedMode: "catalog"
  });
  if (currentValue?.contract !== incoming.contract || currentValue?.mode !== "catalog" ||
      currentValue?.query?.sourceId !== null || currentValue?.query?.targetKind !== null ||
      currentValue?.query?.targetId !== null || !Array.isArray(currentValue?.items) ||
      currentValue?.pdfStorage?.uniqueBytes !== incoming.pdfStorage.uniqueBytes ||
      currentValue?.pdfStorage?.maxUniqueBytes !== incoming.pdfStorage.maxUniqueBytes) {
    fail("invalid_course_sources", "As páginas do catálogo pertencem a leituras diferentes.");
  }
  const items = [...currentValue.items, ...incoming.items];
  if (new Set(items.map(({ sourceId }) => sourceId)).size !== items.length) {
    fail("invalid_course_sources", "A paginação repetiu uma fonte.");
  }
  return Object.freeze({ ...incoming, items: Object.freeze(items) });
}

export function normalizeCourseSourceChange(value, {
  expectedCourseId = "",
  expectedRequestId = ""
} = {}) {
  const normalized = normalizeCourseSourceChangeDomain(value);
  if ((expectedCourseId && normalized.courseId !== expectedCourseId) ||
      (expectedRequestId && normalized.requestId !== expectedRequestId)) {
    fail("invalid_course_sources", "A confirmação não pertence à operação enviada.");
  }
  return normalized;
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
    fail("course_revision_changed", "O curso mudou durante a leitura.");
  }
  if (text(value.outline.courseId) !== course.courseId ||
      outlineRequiredText(value.outline.title, "O título da estrutura") !== course.title ||
      (text(value.outline.goal) || null) !== course.goal) {
    fail("invalid_course_outline", "A estrutura não corresponde ao curso aberto.");
  }

  const identities = new Set();
  const rows = [];
  const microsequences = [];
  let lessonCount = 0;
  let topicCount = 0;
  let studyUnitCount = 0;
  value.outline.modules.forEach((moduleValue, modulePosition) => {
    if (!isPlainObject(moduleValue) || !Array.isArray(moduleValue.lessons)) {
      fail("invalid_course_outline", "Um módulo da estrutura é inválido.");
    }
    const moduleId = outlineIdentity(moduleValue.id, "A identidade do módulo");
    const moduleTitle = outlineRequiredText(moduleValue.title, "O título do módulo");
    const moduleIdentity = `module\u0000${moduleId}`;
    if (identities.has(moduleIdentity)) fail("invalid_course_outline", "A estrutura repete um módulo.");
    identities.add(moduleIdentity);
    rows.push(Object.freeze({
      kind: "module",
      entityId: moduleId,
      label: "Módulo",
      icon: "module",
      title: moduleTitle,
      summary: null,
      context: null,
      entityPath: Object.freeze([course.courseId, moduleId]),
      position: modulePosition
    }));
    moduleValue.lessons.forEach((lessonValue, lessonPosition) => {
      if (!isPlainObject(lessonValue) || !Array.isArray(lessonValue.topics) ||
          !Array.isArray(lessonValue.microsequences)) {
        fail("invalid_course_outline", "Uma lição da estrutura é inválida.");
      }
      lessonCount += 1;
      const lessonId = outlineIdentity(lessonValue.id, "A identidade da lição");
      const lessonTitle = outlineRequiredText(lessonValue.title, "O título da lição");
      const lessonIdentity = `lesson\u0000${lessonId}`;
      if (identities.has(lessonIdentity)) fail("invalid_course_outline", "A estrutura repete uma lição.");
      identities.add(lessonIdentity);
      rows.push(Object.freeze({
        kind: "lesson",
        entityId: lessonId,
        label: "Lição",
        icon: "lesson",
        title: lessonTitle,
        summary: null,
        context: moduleTitle,
        entityPath: Object.freeze([course.courseId, moduleId, lessonId]),
        position: lessonPosition
      }));
      lessonValue.topics.forEach((topicValue, topicPosition) => {
        if (!isPlainObject(topicValue)) {
          fail("invalid_course_outline", "Um tópico da estrutura é inválido.");
        }
        topicCount += 1;
        const topicId = outlineIdentity(topicValue.id, "A identidade do tópico");
        const topicKey = `topic\u0000${topicId}`;
        if (identities.has(topicKey)) fail("invalid_course_outline", "A estrutura repete um tópico.");
        identities.add(topicKey);
        rows.push(Object.freeze({
          kind: "topic",
          entityId: topicId,
          label: "Tópico",
          icon: "tags",
          title: outlineRequiredText(topicValue.title, "O título do tópico"),
          summary: outlineOptionalText(topicValue.summary, "O resumo do tópico", 4_000),
          context: `${moduleTitle} · ${lessonTitle}`,
          entityPath: null,
          position: topicPosition
        }));
      });
      lessonValue.microsequences.forEach((microsequenceValue, microsequencePosition) => {
        if (!isPlainObject(microsequenceValue)) {
          fail("invalid_course_outline", "Uma microssequência didática da estrutura é inválida.");
        }
        const microsequenceId = outlineIdentity(
          microsequenceValue.id,
          "A identidade da microssequência didática"
        );
        const microsequenceIdentity = `microsequence\u0000${microsequenceId}`;
        if (identities.has(microsequenceIdentity)) {
          fail("invalid_course_outline", "A estrutura repete uma microssequência didática.");
        }
        identities.add(microsequenceIdentity);
        const count = naturalNumber(microsequenceValue.studyUnitCount);
        if (count === null) {
          fail("invalid_course_outline", "A contagem da microssequência didática é inválida.");
        }
        studyUnitCount += count;
        const title = outlineRequiredText(
          microsequenceValue.title,
          "O título da microssequência didática"
        );
        const row = Object.freeze({
          kind: "microsequence",
          entityId: microsequenceId,
          label: "Microssequência didática",
          icon: "microsequence",
          title,
          summary: outlineOptionalText(
            microsequenceValue.goal || microsequenceValue.role,
            "A descrição da microssequência didática",
            4_000
          ),
          context: `${moduleTitle} · ${lessonTitle}`,
          entityPath: Object.freeze([
            course.courseId,
            moduleId,
            lessonId,
            microsequenceId
          ]),
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
      message: "Este curso é conhecido neste dispositivo, mas o conteúdo não está disponível agora."
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
      message: "O acesso a este curso não está mais disponível."
    });
  }
  if (["40001", "course_revision_changed"].includes(code)) {
    return Object.freeze({
      kind: "revision-changed",
      message: "O curso mudou durante a leitura. Recarregue para ver a versão atual."
    });
  }
  return Object.freeze({
    kind: "error",
    message: offline
      ? "Não foi possível acessar os cursos sem conexão."
      : "Não foi possível carregar esta área agora."
  });
}
