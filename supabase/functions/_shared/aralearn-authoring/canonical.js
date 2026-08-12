import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

function projectForCourse(course) {
  return {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [structuredClone(course)]
  };
}

function assertOneCourse(document) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    throw new AuthoringApiError(
      422,
      "invalid_course_contract",
      "O curso viola o contrato público por packages.",
      { errors: validation.errors }
    );
  }
  if (document.courses.length !== 1) {
    throw new AuthoringApiError(
      422,
      "invalid_course_count",
      "A operação exige exatamente um curso."
    );
  }
  return document.courses[0];
}

function uuidFromDigest(digest) {
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function sha256Uuid(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return uuidFromDigest(digest);
}

export async function deterministicRequestUuid(value) {
  return sha256Uuid(`aralearn:authoring:v1:${String(value)}`);
}

export async function prepareCourseDocument(document) {
  const course = assertOneCourse(document);
  const revisionDocument = projectForCourse(course);
  return {
    document: revisionDocument,
    course,
    contentHash: await sha256Hex(canonicalJsonStringify(revisionDocument))
  };
}
