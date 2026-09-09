const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const TARGET_KINDS = new Set(["microsequence_explanation", "study_unit"]);
const STATES = new Set(["unregistered", "draft", "current", "stale"]);
const POLICIES = new Set(["saved", "reviewed_only"]);
const READ_FIELDS = ["contract", "courseId", "courseRevision", "targetKind", "targetId", "entityVersion", "basisHash", "contentReview", "reviewPolicy"];

export class CourseContentReviewError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "CourseContentReviewError";
    this.code = "invalid_course_content_review";
  }
}
const fail = (message = "A confirmação da revisão de conteúdo é inválida.") => { throw new CourseContentReviewError(message); };
const plain = value => Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value, required, optional = []) {
  if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail();
}
const positive = value => Number.isSafeInteger(value) && value > 0;

/** Read metadata stays outside editable/importable course content. */
export function normalizeCourseContentReviewState(value) {
  exact(value, ["state"], ["reviewedAt"]);
  if (!STATES.has(value.state)) fail();
  const reviewed = value.state === "current" || value.state === "stale";
  if (reviewed ? typeof value.reviewedAt !== "string" || !INSTANT.test(value.reviewedAt) ||
      !Number.isFinite(Date.parse(value.reviewedAt)) : Object.hasOwn(value, "reviewedAt")) fail();
  return { ...value };
}

function read(value, contract, extra, request) {
  exact(value, [...READ_FIELDS, ...extra]);
  if (value.contract !== contract || typeof value.courseId !== "string" || !UUID.test(value.courseId) || !positive(value.courseRevision) ||
      !TARGET_KINDS.has(value.targetKind) || typeof value.targetId !== "string" ||
      !value.targetId.trim() || value.targetId.length > 300 || /\p{Cc}/u.test(value.targetId) ||
      !positive(value.entityVersion) || typeof value.basisHash !== "string" || !HASH.test(value.basisHash) ||
      !POLICIES.has(value.reviewPolicy)) fail();
  if (request && ["courseId", "targetKind", "targetId"].some(key => request[key] !== undefined && value[key] !== request[key])) {
    fail("A confirmação não corresponde ao objeto solicitado.");
  }
  return { ...value, contentReview: normalizeCourseContentReviewState(value.contentReview) };
}

export function normalizeCourseContentReview(value, request) {
  return read(value, "aralearn.course-content-review.v1", [], request);
}

export function normalizeCourseContentReviewChange(value, request) {
  const result = read(value, "aralearn.course-content-review-change.v1", ["changed", "idempotent"], request);
  if (typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
      request?.expectedBasisHash !== undefined && value.basisHash !== request.expectedBasisHash ||
      request?.reviewed === true && value.contentReview.state !== "current" ||
      request?.reviewed === false && ["current", "stale"].includes(value.contentReview.state)) fail();
  return result;
}

export function normalizeCourseContentReviewPolicyChange(value, request) {
  exact(value, ["contract", "courseId", "courseRevision", "reviewPolicy", "changed", "idempotent"]);
  if (value.contract !== "aralearn.course-content-review-policy.v1" || typeof value.courseId !== "string" || !UUID.test(value.courseId) ||
      !positive(value.courseRevision) || !POLICIES.has(value.reviewPolicy) ||
      typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
      request?.courseId !== undefined && value.courseId !== request.courseId ||
      request?.policy !== undefined && value.reviewPolicy !== request.policy) fail("A confirmação da política de revisão é inválida.");
  return { ...value };
}
