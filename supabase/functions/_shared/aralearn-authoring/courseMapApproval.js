import { AuthoringApiError } from "./errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
function invalid() {
  throw new AuthoringApiError(422, "invalid_map_approval_reference",
    "Use a referência devolvida pela leitura completa do mapa, sem editá-la.");
}

// An opaque reference binds an inspection and its replay identity. It grants no
// access: the transactional writer independently checks the owner and basis.
export function createMapApprovalReference({ principal, courseId, basis,
  requestId = `map:${courseId}:${basis?.courseRevision}:${basis?.planVersion}` }) {
  if (!UUID.test(courseId) || !UUID.test(principal?.actorId) || !REQUEST_ID.test(requestId) ||
      !Number.isSafeInteger(basis?.courseRevision) || basis.courseRevision < 1 ||
      !Number.isSafeInteger(basis?.planVersion) || basis.planVersion < 1 || !HASH.test(basis?.basisHash)) invalid();
  return btoa(JSON.stringify({ actor: principal.actorId, courseId, ...basis, requestId }))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function openMapApprovalReference(reference, principal) {
  let value;
  try {
    if (typeof reference !== "string" || reference.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(reference)) invalid();
    value = JSON.parse(atob(reference.replaceAll("-", "+").replaceAll("_", "/")));
  } catch { invalid(); }
  if (!value || Object.keys(value).sort().join(",") !== "actor,basisHash,courseId,courseRevision,planVersion,requestId" ||
      value.actor !== principal?.actorId) invalid();
  createMapApprovalReference({ principal, courseId: value.courseId, basis: {
    courseRevision: value.courseRevision, planVersion: value.planVersion, basisHash: value.basisHash
  }, requestId: value.requestId });
  return value;
}
