import { AuthoringApiError } from "./errors.js";
import { normalizeCourseContentReview } from "../aralearn/runtime/domain/courseContentReview.js";
import { sha256Hex } from "./security.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const invalid = () => { throw new AuthoringApiError(422, "invalid_content_review_reference",
  "Use a referência do objeto salvo que foi inspecionado, sem alterá-la."); };

// A referência conserva a base e a tentativa. O banco exige o proprietário e
// verifica o hash corrente; este transporte não concede acesso nem prova leitura.
export async function createContentReviewReference({ principal, read, requestId = null }) {
  const value = normalizeCourseContentReview(read);
  if (requestId === null) {
    const hash = await sha256Hex(JSON.stringify({ actor: principal?.actorId, read: value }));
    requestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
  if (!UUID.test(principal?.actorId) || !UUID.test(requestId)) invalid();
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify({ actor: principal.actorId, courseId: value.courseId,
    targetKind: value.targetKind, targetId: value.targetId, basisHash: value.basisHash, requestId })), byte => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function openContentReviewReference(reference, principal) {
  let value;
  try {
    if (typeof reference !== "string" || reference.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(reference)) invalid();
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(
      atob(reference.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0))));
  } catch { invalid(); }
  if (!value || Object.keys(value).sort().join(",") !== "actor,basisHash,courseId,requestId,targetId,targetKind" ||
      value.actor !== principal?.actorId || !UUID.test(value.actor) || !UUID.test(value.courseId) ||
      !UUID.test(value.requestId) || !["microsequence_explanation", "study_unit"].includes(value.targetKind) ||
      typeof value.targetId !== "string" || !value.targetId.trim() || value.targetId.length > 300 || /\p{Cc}/u.test(value.targetId) ||
      !/^[a-f0-9]{64}$/u.test(value.basisHash)) invalid();
  return value;
}
