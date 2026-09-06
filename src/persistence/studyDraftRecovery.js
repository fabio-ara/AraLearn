import { UUID_PATTERN } from "../domain/identifiers.js";
import { normalizeOwnedCourseCopyRecoveryCommand } from "../domain/courseComposition.js";

export const STUDY_DRAFT_RECOVERY_CACHE_KEY = "course.v1.study-draft-recoveries";
export const STUDY_DRAFT_RECOVERY_CONTRACT = "aralearn.study-draft-recoveries.v1";

export function serializeStudyDraftSnapshot(snapshot) {
  try {
    const seen = new Set();
    return JSON.stringify(snapshot, function (key, value) {
      const original = this[key];
      if (value === undefined || typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0)) ||
          typeof original === "object" && original !== null && !Array.isArray(original) &&
            ![Object.prototype, null].includes(Object.getPrototypeOf(original))) {
        throw new TypeError("O snapshot precisa de representação explícita.");
      }
      if (value && typeof value === "object") {
        if (seen.has(value)) throw new TypeError("O snapshot contém referências compartilhadas.");
        if (Array.isArray(value) && Object.keys(value).some((name) =>
          !/^(0|[1-9][0-9]*)$/u.test(name) || Number(name) >= value.length)) {
          throw new TypeError("O snapshot contém propriedades adicionais em um array.");
        }
        seen.add(value);
      }
      return value;
    }, 2);
  } catch {
    // Unknown JSON-shaped evidence can contain cycles, shared objects or values
    // JSON would discard. References make those relationships recoverable.
    const nodes = [];
    const seen = new Map();
    const encode = (value) => {
      if (value === undefined) return { scalar: "undefined" };
      if (typeof value === "bigint") return { scalar: "bigint", value: String(value) };
      if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
        return { scalar: "number", value: Object.is(value, -0) ? "-0" : String(value) };
      }
      if (value === null || typeof value !== "object") return value;
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw Object.assign(new TypeError(
          "Este tipo de dado não permite exportação integral pelo aplicativo. O original continua guardado; não o descarte se ainda precisar recuperá-lo."
        ), { code: "DRAFT_EXPORT_FORMAT_UNSUPPORTED" });
      }
      if (seen.has(value)) return { ref: seen.get(value) };
      const ref = nodes.length;
      seen.set(value, ref);
      const node = { type: Array.isArray(value) ? "array" : "object", properties: [] };
      if (Array.isArray(value)) node.length = value.length;
      nodes.push(node);
      node.properties = Object.entries(value).map(([key, item]) => [key, encode(item)]);
      return { ref };
    };
    const root = encode(snapshot);
    return JSON.stringify({ contract: "aralearn.study-draft-snapshot-graph.v1", root, nodes }, null, 2);
  }
}

export function readStudyDraftRecoveries(value) {
  if (value == null) return [];
  if (value.contract !== STUDY_DRAFT_RECOVERY_CONTRACT || !Array.isArray(value.entries) ||
      value.entries.some((entry) => !entry || typeof entry !== "object" ||
        typeof entry.recoveryId !== "string" || !entry.recoveryId ||
        !Object.hasOwn(entry, "originalSnapshot") ||
        !Object.hasOwn(entry, "command") ||
        entry.sourceCourseId !== null && !UUID_PATTERN.test(entry.sourceCourseId) ||
        entry.requestId !== null && typeof entry.requestId !== "string") ||
      new Set(value.entries.map(({ recoveryId }) => recoveryId)).size !== value.entries.length) {
    throw new TypeError("Os rascunhos guardados não puderam ser lidos. Os dados foram preservados; atualize o aplicativo e tente novamente.");
  }
  return structuredClone(value.entries);
}

// Called only by the IndexedDB versionchange transaction, never by a draft read.
export function upgradeStudyDraftRecoveries(store) {
  const previousKeys = ["course.v1.study-draft-recovery", "aralearn.personal-course-copy-edit-pending.v1"];
  const keys = [STUDY_DRAFT_RECOVERY_CACHE_KEY, ...previousKeys];
  const rows = new Map();
  for (const key of keys) {
    const request = store.get(key);
    request.onsuccess = () => {
      rows.set(key, request.result);
      if (rows.size !== keys.length) return;
      // An unexpected destination must not be overwritten, even during upgrade.
      if (rows.get(STUDY_DRAFT_RECOVERY_CACHE_KEY)) {
        store.transaction.abort();
        return;
      }
      const entries = previousKeys.filter((key) => rows.get(key)).map((key, index) => {
        const originalSnapshot = rows.get(key).value;
        const snapshot = originalSnapshot?.value ?? originalSnapshot;
        let command = null;
        try {
          command = normalizeOwnedCourseCopyRecoveryCommand(Object.fromEntries([
            "requestId", "sourceCourseId", "expectedSourceCourseRevision", "expectedStudyUnitVersion",
            "didacticMicrosequenceId", "studyUnit", "origin"
          ].map((field) => [field, snapshot?.[field]])));
        } catch {
          // Unknown evidence remains intact, but cannot generate a request.
        }
        const sourceCourseId = String(snapshot?.sourceCourseId || "").trim().toLowerCase();
        return {
          recoveryId: `draft-${index + 1}`,
          sourceCourseId: UUID_PATTERN.test(sourceCourseId) ? sourceCourseId : null,
          requestId: typeof snapshot?.requestId === "string" ? snapshot.requestId : null,
          command,
          studyUnit: snapshot?.studyUnit ?? null,
          targetId: typeof snapshot?.targetId === "string" ? snapshot.targetId : null,
          originalSnapshot
        };
      });
      if (entries.length) store.put({ key: STUDY_DRAFT_RECOVERY_CACHE_KEY,
        value: { contract: STUDY_DRAFT_RECOVERY_CONTRACT, entries } });
      for (const key of previousKeys) store.delete(key);
    };
  }
}
