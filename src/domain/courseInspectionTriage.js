const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const STATES = new Set(["current", "pending", "unregistered", "unavailable"]);
const TARGETS = new Set(["study_unit", "microsequence_explanation"]);
const DIMENSIONS = ["alignment", "evidence", "representation", "feedback", "sufficiency", "configuration"];
const OUTCOMES = new Set(["consistent", "needs_attention", "human_preference_retained"]);
const RESULTS = new Set(["sufficient", "insufficient", "not_applicable"]);
const plain = value => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, required, optional = []) => {
  if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail();
};
const fail = (message = "A triagem de inspeção é inválida.") => {
  throw Object.assign(new TypeError(message), { code: "invalid_course_inspection_triage" });
};
const positive = value => Number.isSafeInteger(value) && value > 0;
const bounded = (value, max) => typeof value === "string" && value.length <= max &&
  ![...value].some(character => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });

function normalizeItem(value) {
  exact(value, ["targetKind", "targetId", "title", "ordinal", "focusArguments", "state", "dimensionsCurrentComplete", "report"]);
  if (!TARGETS.has(value.targetKind) || !bounded(value.targetId, 240) || !value.targetId.trim() ||
      !bounded(value.title, 300) || !value.title.trim() || !positive(value.ordinal) || !plain(value.focusArguments) ||
      value.targetKind === "study_unit" && (!Array.isArray(value.focusArguments.unidades) ||
        value.focusArguments.unidades.length !== 1 || !positive(value.focusArguments.unidades[0]) ||
        Object.keys(value.focusArguments).some(key => key !== "unidades")) ||
      value.targetKind === "microsequence_explanation" &&
        (!positive(value.focusArguments.modulo) || !positive(value.focusArguments.licao) ||
          !positive(value.focusArguments.microssequencia) || Object.keys(value.focusArguments).some(key =>
            !["modulo", "licao", "microssequencia"].includes(key))) || !STATES.has(value.state)) fail();
  if (value.state !== "current") {
    if (value.dimensionsCurrentComplete !== null || value.report !== null) fail();
    return { ...value };
  }
  if (typeof value.dimensionsCurrentComplete !== "boolean") fail();
  exact(value.report, ["summary", "outcome", "findings", "checks"]);
  if (!bounded(value.report.summary, 1000) || !OUTCOMES.has(value.report.outcome) ||
      !Array.isArray(value.report.findings) || value.report.findings.length > 20 ||
      value.report.findings.some(item => !bounded(item, 300)) ||
      !Array.isArray(value.report.checks) || value.report.checks.length > 6) fail();
  const checks = value.report.checks.map(check => {
    exact(check, ["dimension", "result", "reason"]);
    if (!DIMENSIONS.includes(check.dimension) || !RESULTS.has(check.result) || !bounded(check.reason, 200)) fail();
    return { ...check };
  });
  if (new Set(checks.map(check => check.dimension)).size !== checks.length ||
      value.dimensionsCurrentComplete !== (DIMENSIONS.every(dimension => checks.some(check => check.dimension === dimension)))) fail();
  return { ...value, report: { ...value.report, findings: [...value.report.findings], checks } };
}

export function normalizeCourseInspectionTriagePage(value, request = {}) {
  exact(value, ["contract", "courseId", "courseRevision", "scope", "items", "totalCount", "hasMore", "nextCursor"]);
  if (!plain(value.scope)) fail();
  exact(value.scope, ["kind", "id"]);
  if (value.contract !== "aralearn.course-inspection-triage-page.v1" || !UUID.test(value.courseId) ||
      !positive(value.courseRevision) || request.courseId !== undefined && value.courseId !== request.courseId ||
      request.expectedRevision !== undefined && value.courseRevision !== request.expectedRevision ||
      !new Set(["course", "authoring_part", "unassigned", "module", "lesson", "didactic_microsequence", "selected_units"]).has(value.scope.kind) ||
      !(value.scope.id === null || bounded(value.scope.id, 240)) || !Array.isArray(value.items) || value.items.length > 12 ||
      (["course", "unassigned", "selected_units"].includes(value.scope.kind) ? value.scope.id !== null : value.scope.id === null) ||
      !Number.isSafeInteger(value.totalCount) || value.totalCount < value.items.length ||
      typeof value.hasMore !== "boolean" || !(value.nextCursor === null || /^(0|[1-9][0-9]{0,17})$/u.test(value.nextCursor)) ||
      value.hasMore !== (value.nextCursor !== null) || value.hasMore && value.items.length === 0) fail();
  const items = value.items.map(normalizeItem);
  const identities = items.map(item => `${item.targetKind}:${item.targetId}`);
  if (new Set(identities).size !== identities.length || items.some((item, index) => index > 0 &&
      item.ordinal <= items[index - 1].ordinal) || value.nextCursor !== null &&
      Number(value.nextCursor) !== items.at(-1)?.ordinal || items.some(item => item.ordinal > value.totalCount) ||
      typeof request.cursorOrdinal === "string" && items.some(item => item.ordinal <= Number(request.cursorOrdinal)) ||
      value.hasMore !== (items.length > 0 && items.at(-1).ordinal < value.totalCount)) fail();
  return { contract: value.contract, courseId: value.courseId, courseRevision: value.courseRevision,
    scope: { kind: value.scope.kind, id: value.scope.id }, items, totalCount: value.totalCount,
    hasMore: value.hasMore, nextCursor: value.nextCursor };
}

export function normalizeCourseInspectionTriageOutline(value, request = {}) {
  exact(value, ["contract", "courseId", "courseRevision", "plan"]);
  if (value.contract !== "aralearn.course-inspection-triage-outline.v1" || !UUID.test(value.courseId) ||
      !positive(value.courseRevision) || request.courseId !== undefined && value.courseId !== request.courseId ||
      request.expectedRevision !== undefined && value.courseRevision !== request.expectedRevision || !plain(value.plan) ||
      !bounded(value.plan.title, 300) || !plain(value.plan.curriculum) ||
      !Array.isArray(value.plan.curriculum.modules) || !Array.isArray(value.plan.parts) ||
      !Array.isArray(value.plan.studyUnits) || value.plan.curriculum.modules.length > 128 ||
      value.plan.parts.length > 256 || value.plan.studyUnits.length > 10000) fail();
  const id = item => bounded(item, 240) && Boolean(item.trim());
  const position = item => Number.isSafeInteger(item) && item >= 0;
  const micro = item => plain(item) && id(item.id) && bounded(item.title, 300) && position(item.position);
  const modules = value.plan.curriculum.modules.map(module => {
    if (!plain(module) || !id(module.id) || !bounded(module.title, 300) || !position(module.position) ||
        !Array.isArray(module.lessons) || module.lessons.length > 512) fail();
    const lessons = module.lessons.map(lesson => {
      if (!plain(lesson) || !id(lesson.id) || !bounded(lesson.title, 300) || !position(lesson.position) ||
          !Array.isArray(lesson.microsequences) || lesson.microsequences.length > 2048 ||
          lesson.microsequences.some(item => !micro(item))) fail();
      return { id: lesson.id, title: lesson.title, position: lesson.position,
        microsequences: lesson.microsequences.map(item => ({ id: item.id, title: item.title, position: item.position })) };
    });
    return { id: module.id, title: module.title, position: module.position, lessons };
  });
  const parts = value.plan.parts.map(part => {
    if (!plain(part) || !id(part.id) || !bounded(part.title, 300) || !position(part.position) ||
        !Array.isArray(part.microsequences) || part.microsequences.length > 2048 ||
        part.microsequences.some(item => !plain(item) || !id(item.id) || !bounded(item.title, 300) ||
          !position(item.productionPosition))) fail();
    return { id: part.id, title: part.title, position: part.position, microsequences: part.microsequences.map(item => ({
      id: item.id, title: item.title, productionPosition: item.productionPosition
    })) };
  });
  const studyUnits = value.plan.studyUnits.map(unit => {
    if (!plain(unit) || !id(unit.id) || !bounded(unit.title, 300) || !positive(unit.ordinal) ||
        !plain(unit.curriculumPath) || !id(unit.curriculumPath.moduleId) || !id(unit.curriculumPath.lessonId) ||
        !id(unit.curriculumPath.didacticMicrosequenceId) ||
        !(unit.authoringPartId === null || id(unit.authoringPartId))) fail();
    return { id: unit.id, title: unit.title, ordinal: unit.ordinal,
      curriculumPath: { moduleId: unit.curriculumPath.moduleId, lessonId: unit.curriculumPath.lessonId,
        didacticMicrosequenceId: unit.curriculumPath.didacticMicrosequenceId }, authoringPartId: unit.authoringPartId };
  });
  return { contract: value.contract, courseId: value.courseId, courseRevision: value.courseRevision,
    plan: { title: value.plan.title, curriculum: { modules }, parts, studyUnits } };
}
