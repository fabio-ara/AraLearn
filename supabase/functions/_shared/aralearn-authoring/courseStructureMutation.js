import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const text = (value, limit) => typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= limit && !/\p{Cc}/u.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const fields = ["operation", "kind", "targetId", "parentId", "position", "title"];

export function normalizeCourseStructureCommand(command) {
  if (!command || Object.getPrototypeOf(command) !== Object.prototype || Object.keys(command).length !== fields.length ||
      fields.some(key => !Object.hasOwn(command, key)) || !["move", "duplicate", "remove"].includes(command.operation) ||
      !["module", "lesson", "microsequence"].includes(command.kind) || !text(command.targetId, 240) ||
      command.parentId !== null && !text(command.parentId, 240) ||
      command.position !== null && (!Number.isSafeInteger(command.position) || command.position < 0 || command.position > 63) ||
      (command.operation === "duplicate" ? !text(command.title, 300) : command.title !== null) ||
      command.operation === "remove" && (command.parentId !== null || command.position !== null) ||
      command.kind === "module" && command.parentId !== null) {
    throw new AuthoringApiError(422, "invalid_course_structure_command", "A alteração deve indicar um ramo, uma operação e um destino compatível.");
  }
  return structuredClone(command);
}

export async function mutateCourseStructure(adapter, { principal, courseId, expectedRevision, expectedPlanVersion, command, requestId, deadlineAt = null }) {
  const normalized = normalizeCourseStructureCommand(command);
  if (!UUID.test(courseId) || !UUID.test(principal?.actorId) || !positive(expectedRevision) || !positive(expectedPlanVersion) ||
      typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId)) {
    throw new AuthoringApiError(422, "invalid_course_structure_identity", "A alteração exige a versão lida e a mesma identidade de tentativa.");
  }
  const raw = await adapter.rpc("mutate_course_structure_for_actor_v1", {
    p_actor_id: principal.actorId, p_course_id: courseId, p_expected_revision: expectedRevision,
    p_expected_plan_version: expectedPlanVersion, p_command: normalized, p_request_id: requestId
  }, { deadlineAt, timeoutMs: 60_000, responseLimitBytes: 16384, retry: false });
  const result = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  const expectedTargetId = normalized.operation === "duplicate"
    ? `copy-${(await sha256Hex(`${principal.actorId}:${requestId}:${normalized.kind}:${normalized.targetId}`)).slice(0, 48)}` : normalized.targetId;
  const keys = ["contract", "courseId", "courseRevision", "planVersion", "operation", "targetKind", "targetId", "affectedEntityCount", "changed", "idempotent"];
  if (!result || typeof result !== "object" || Array.isArray(result) || Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)) ||
      result.contract !== "aralearn.course-structure-change.v1" || result.courseId !== courseId || result.operation !== normalized.operation ||
      result.targetKind !== normalized.kind || result.targetId !== expectedTargetId ||
      !positive(result.courseRevision) || !positive(result.planVersion) || typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean" ||
      !Number.isSafeInteger(result.affectedEntityCount) || result.affectedEntityCount < 0 ||
      result.affectedEntityCount === 0 !== !result.changed || normalized.operation !== "move" && !result.changed ||
      result.courseRevision !== expectedRevision + Number(result.changed) || result.planVersion !== expectedPlanVersion + Number(result.changed)) {
    // A malformed response does not justify a fresh mutation. The executor
    // rereads by the saved ID and replays the same body/request under SQL receipt.
    throw new AuthoringApiError(503, "invalid_course_structure_result", "A alteração não pôde ser confirmada; preserve a mesma tentativa para retomar.");
  }
  return structuredClone(result);
}

export async function reorderCourseStudyUnits(adapter, { principal, courseId, expectedRevision, microsequenceId, studyUnitIds, requestId, deadlineAt = null }) {
  if (!UUID.test(courseId) || !UUID.test(principal?.actorId) || !positive(expectedRevision) || !text(microsequenceId, 240) ||
      !Array.isArray(studyUnitIds) || !studyUnitIds.length || studyUnitIds.some(id => !text(id, 240)) || new Set(studyUnitIds).size !== studyUnitIds.length ||
      new TextEncoder().encode(JSON.stringify(studyUnitIds)).length > 512 * 1024 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId)) {
    throw new AuthoringApiError(422, "invalid_course_study_unit_order", "Informe uma vez cada unidade da microssequência, na ordem escolhida.");
  }
  const raw = await adapter.rpc("reorder_course_study_units_for_actor_v1", { p_actor_id: principal.actorId, p_course_id: courseId,
    p_expected_revision: expectedRevision, p_microsequence_id: microsequenceId, p_study_unit_ids: studyUnitIds, p_request_id: requestId },
  { deadlineAt, timeoutMs: 60_000, responseLimitBytes: 512 * 1024, retry: false });
  const result = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  const keys = ["contract", "courseId", "courseRevision", "microsequenceId", "studyUnitIds", "changed", "idempotent", "affectedEntityCount"];
  if (!result || typeof result !== "object" || Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)) ||
      result.contract !== "aralearn.course-study-unit-order.v1" || result.courseId !== courseId || result.microsequenceId !== microsequenceId ||
      JSON.stringify(result.studyUnitIds) !== JSON.stringify(studyUnitIds) || typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean" ||
      result.courseRevision !== expectedRevision + Number(result.changed) || !Number.isSafeInteger(result.affectedEntityCount) ||
      result.affectedEntityCount < 0 || result.affectedEntityCount > studyUnitIds.length || result.affectedEntityCount === 0 !== !result.changed) {
    throw new AuthoringApiError(503, "invalid_course_study_unit_order_result", "A ordem não pôde ser confirmada; preserve a mesma tentativa.");
  }
  return structuredClone(result);
}
