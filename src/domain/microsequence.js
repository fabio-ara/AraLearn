import { findMicrosequenceVersion } from "./microsequenceVersion.js";
export const MICROSEQUENCE_STATUSES = Object.freeze(["planned", "generated", "needs_review", "ready"]);

export function getActiveMicrosequenceVersion(microsequence) {
  const versions = Array.isArray(microsequence?.versions) ? microsequence.versions : [];
  if (!versions.length) {
    return null;
  }
  if (!microsequence?.activeVersion) {
    return versions[versions.length - 1];
  }
  return findMicrosequenceVersion(microsequence, microsequence.activeVersion) || versions[versions.length - 1];
}

export function cloneMicrosequenceWithVersion(microsequence, version, nextStatus = "generated") {
  const versions = Array.isArray(microsequence?.versions) ? [...microsequence.versions, version] : [version];
  return {
    ...microsequence,
    versions,
    activeVersion: version.id,
    status: nextStatus
  };
}
