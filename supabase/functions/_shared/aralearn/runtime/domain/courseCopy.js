const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID}$`, "u");
const COPY_REQUEST = new RegExp(`^copy:([0-9]{13}):(${UUID})$`, "u");
export const COURSE_COPY_REQUEST_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const COURSE_COPY_REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class CourseCopyError extends TypeError {
  constructor(message) { super(message); this.name = "CourseCopyError"; this.code = "invalid_course_copy"; }
}
const fail = (message) => { throw new CourseCopyError(message); };
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    fail("O pedido de cópia contém campos ausentes ou desconhecidos.");
  }
}
function uuid(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail("Identidade de curso inválida.");
  return value;
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("Instante da cópia inválido.");
  return value;
}
function requestIdentity(value) {
  const match = typeof value.requestId === "string" && value.requestId.match(COPY_REQUEST);
  if (!match || Date.parse(instant(value.requestedAt)) !== Number(match[1])) fail("A identidade e o instante do pedido de cópia divergem.");
}

// Create once when the author chooses Copy; retain both fields with the pending
// request. A retry never obtains a fresh identity or a newer timestamp.
export function createCourseCopyRequestIdentity({ now = Date.now(), randomUUID = () => globalThis.crypto.randomUUID() } = {}) {
  if (!Number.isSafeInteger(now) || now < 1_000_000_000_000 || now > 9_999_999_999_999) fail("Instante da cópia inválido.");
  return { requestId: `copy:${now}:${uuid(randomUUID())}`, requestedAt: new Date(now).toISOString() };
}

export function normalizeCourseCopyRequest(value) {
  exact(value, ["sourceCourseId", "expectedSourceRevision", "title", "confirmed", "requestId", "requestedAt"]);
  uuid(value.sourceCourseId); requestIdentity(value);
  if (!Number.isSafeInteger(value.expectedSourceRevision) || value.expectedSourceRevision < 1) fail("Releia o curso antes de copiar.");
  if (value.confirmed !== true) fail("Confirme a criação da cópia independente.");
  if (typeof value.title !== "string" || !value.title.trim() || [...value.title].length > 300 ||
      /\p{Cc}/u.test(value.title)) fail("Informe um título válido para a cópia.");
  return { ...value, title: value.title.trim() };
}

export function normalizeCourseCopyResult(value, request) {
  exact(value, ["contract", "sourceCourseId", "sourceCourseRevision", "targetCourseId", "initialCourseRevision", "copiedAt", "requestId", "idempotent"]);
  uuid(value.sourceCourseId); uuid(value.targetCourseId);
  if (value.contract !== "aralearn.course-copy.v1" || value.sourceCourseId === value.targetCourseId ||
      !Number.isSafeInteger(value.sourceCourseRevision) || value.sourceCourseRevision < 1 ||
      value.initialCourseRevision !== 1 || typeof value.idempotent !== "boolean" ||
      typeof value.requestId !== "string" || !COPY_REQUEST.test(value.requestId) ||
      typeof value.copiedAt !== "string" || !Number.isFinite(Date.parse(value.copiedAt))) fail("A confirmação da cópia é inválida.");
  if (request && (value.sourceCourseId !== request.sourceCourseId ||
      value.sourceCourseRevision !== request.expectedSourceRevision || value.requestId !== request.requestId)) {
    fail("A confirmação não corresponde à cópia solicitada.");
  }
  return structuredClone(value);
}
