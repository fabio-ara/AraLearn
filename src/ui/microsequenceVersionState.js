import { getActiveMicrosequenceVersion } from "../domain/microsequence.js";

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function cloneMicrosequenceContent(microsequence) {
  const activeVersion = getActiveMicrosequenceVersion(microsequence);
  return {
    title: microsequence?.title || "",
    ...(microsequence?.goal ? { goal: microsequence.goal } : {}),
    ...(microsequence?.status ? { status: microsequence.status } : {}),
    ...(microsequence?.role ? { role: microsequence.role } : {}),
    ...(microsequence?.branchOf ? { branchOf: microsequence.branchOf } : {}),
    dependsOn: Array.isArray(microsequence?.dependsOn) ? structuredClone(microsequence.dependsOn) : [],
    covers: Array.isArray(microsequence?.covers) ? structuredClone(microsequence.covers) : [],
    checks: Array.isArray(microsequence?.checks) ? structuredClone(microsequence.checks) : [],
    cards: Array.isArray(activeVersion?.cards) ? structuredClone(activeVersion.cards) : []
  };
}

function normalizeVersionNumber(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeVersionId(versionNumber) {
  return `v${versionNumber}`;
}

function readVersionNumberFromId(id, fallback) {
  const match = String(id || "").trim().match(/^v(\d+)$/i);
  if (!match) {
    return fallback;
  }

  return normalizeVersionNumber(Number.parseInt(match[1], 10), fallback);
}

function normalizeStoredVersionId(id, versionNumber) {
  return /^v\d+$/i.test(String(id || "").trim()) ? String(id).trim() : normalizeVersionId(versionNumber);
}

function normalizeLabel(label, versionNumber) {
  const text = typeof label === "string" ? label.trim() : "";
  return text || `Versão ${versionNumber}`;
}

function normalizeOperationType(value, fallback = "snapshot") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeTimestamp(value, fallbackIso) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackIso : value.toISOString();
  }

  if (typeof value !== "string" || !value.trim()) {
    return fallbackIso;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
}

function sortVersions(versions) {
  return (Array.isArray(versions) ? versions : [])
    .slice()
    .sort((left, right) => {
      const leftNumber = normalizeVersionNumber(left?.versionNumber, readVersionNumberFromId(left?.id, 0));
      const rightNumber = normalizeVersionNumber(right?.versionNumber, readVersionNumberFromId(right?.id, 0));
      return leftNumber - rightNumber;
    });
}

function normalizeParentVersionId(value, versions, fallbackIndex = -1) {
  const normalized = String(value || "").trim();
  if (normalized && versions.some((version) => version.id === normalized)) {
    return normalized;
  }

  if (fallbackIndex > 0) {
    return versions[fallbackIndex - 1]?.id || "";
  }

  return "";
}

function getLastVersion(entry) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  return versions.at(-1) || null;
}

export function ensureStoredMicrosequenceVersionEntry(entries, versionKey, microsequence, { now = new Date() } = {}) {
  const safeVersionKey = typeof versionKey === "string" ? versionKey.trim() : "";
  if (!safeVersionKey || !microsequence || typeof microsequence !== "object") {
    return null;
  }

  const currentEntry = entries?.[safeVersionKey];
  if (currentEntry && Array.isArray(currentEntry.versions) && currentEntry.versions.length) {
    return currentEntry;
  }

  const initialVersion = createMicrosequenceVersionRecord(microsequence, {
    versionNumber: 1,
    label: "Snapshot 1",
    operationType: "snapshot",
    now
  });
  entries[safeVersionKey] = {
    activeVersionId: initialVersion.id,
    versions: [initialVersion]
  };
  return entries[safeVersionKey];
}

export function createMicrosequenceVersionRecord(
  microsequence,
  {
    id = "",
    versionNumber = 1,
    label = "",
    operationType = "snapshot",
    parentVersionId = "",
    createdAt,
    updatedAt,
    now = new Date()
  } = {}
) {
  const safeVersionNumber = normalizeVersionNumber(versionNumber, 1);
  const createdIso = normalizeTimestamp(createdAt, nowIso(now));
  const updatedIso = normalizeTimestamp(updatedAt, createdIso);

  return {
    id: String(id || normalizeVersionId(safeVersionNumber)).trim() || normalizeVersionId(safeVersionNumber),
    versionNumber: safeVersionNumber,
    label: normalizeLabel(label, safeVersionNumber),
    operationType: normalizeOperationType(operationType),
    ...(parentVersionId ? { parentVersionId: String(parentVersionId).trim() } : {}),
    ...cloneMicrosequenceContent(microsequence),
    createdAt: createdIso,
    updatedAt: updatedIso
  };
}

export function normalizeMicrosequenceVersionEntry(entry, { now = new Date() } = {}) {
  const rawVersions = sortVersions(Array.isArray(entry?.versions) ? entry.versions.filter(Boolean) : []);
  if (!rawVersions.length) {
    return {
      activeVersionId: "",
      versions: []
    };
  }

  const activeIndex = Math.max(
    0,
    rawVersions.findIndex((version) => version?.id === entry?.activeVersionId)
  );

  const normalizedVersions = rawVersions.map((version, index) => {
    const fallbackNumber = index + 1;
    const versionNumber = normalizeVersionNumber(
      version?.versionNumber,
      readVersionNumberFromId(version?.id, fallbackNumber)
    );
    return createMicrosequenceVersionRecord(version, {
      id: normalizeStoredVersionId(version?.id, versionNumber),
      versionNumber,
      label: version?.label,
      operationType: version?.operationType || "migration",
      parentVersionId: version?.parentVersionId,
      createdAt: version?.createdAt,
      updatedAt: version?.updatedAt,
      now
    });
  });

  normalizedVersions.forEach((version, index) => {
    const parentVersionId = normalizeParentVersionId(version.parentVersionId, normalizedVersions, index);
    if (parentVersionId) {
      version.parentVersionId = parentVersionId;
      return;
    }
    delete version.parentVersionId;
  });

  return {
    activeVersionId: normalizedVersions[activeIndex]?.id || normalizedVersions.at(-1)?.id || "",
    versions: normalizedVersions
  };
}

export function replaceActiveMicrosequenceVersion(entry, microsequence, { now = new Date() } = {}) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const activeIndex = Math.max(0, versions.findIndex((version) => version.id === entry?.activeVersionId));
  const currentVersion = versions[activeIndex];
  if (!currentVersion) {
    return null;
  }

  const nextVersion = createMicrosequenceVersionRecord(microsequence, {
    id: currentVersion.id,
    versionNumber: currentVersion.versionNumber || activeIndex + 1,
    label: currentVersion.label,
    operationType: currentVersion.operationType || "snapshot",
    parentVersionId: currentVersion.parentVersionId || "",
    createdAt: currentVersion.createdAt,
    updatedAt: now,
    now
  });

  entry.versions = versions.map((version, index) => (index === activeIndex ? nextVersion : version));
  entry.activeVersionId = nextVersion.id;
  return nextVersion;
}

export function insertMicrosequenceVersionAfterActive(
  entry,
  microsequence,
  {
    label = "",
    operationType = "snapshot",
    parentVersionId = "",
    now = new Date()
  } = {}
) {
  const versions = Array.isArray(entry?.versions) ? entry.versions.slice() : [];
  const lastVersion = getLastVersion(entry);
  const nextVersionNumber = normalizeVersionNumber(lastVersion?.versionNumber, versions.length) + 1;
  const insertedVersion = createMicrosequenceVersionRecord(microsequence, {
    versionNumber: nextVersionNumber,
    label,
    operationType,
    parentVersionId: String(parentVersionId || entry?.activeVersionId || "").trim(),
    createdAt: now,
    updatedAt: now,
    now
  });

  entry.versions = versions.concat(insertedVersion);
  entry.activeVersionId = insertedVersion.id;
  return insertedVersion;
}

export function removeMicrosequenceVersion(entry, versionId) {
  const versions = Array.isArray(entry?.versions) ? entry.versions.slice() : [];
  if (versions.length <= 1) {
    return null;
  }

  const targetIndex = versions.findIndex((version) => version.id === versionId);
  if (targetIndex < 0) {
    return null;
  }

  versions.splice(targetIndex, 1);
  entry.versions = versions;
  if (entry.activeVersionId === versionId) {
    const fallbackIndex = targetIndex > 0 ? targetIndex - 1 : 0;
    entry.activeVersionId = entry.versions[fallbackIndex]?.id || entry.versions[0]?.id || "";
  }

  entry.versions.forEach((version) => {
    if (version.parentVersionId === versionId) {
      delete version.parentVersionId;
    }
  });

  return entry.versions[Math.max(0, targetIndex - 1)] || entry.versions[0] || null;
}

export function removeActiveMicrosequenceVersion(entry) {
  return removeMicrosequenceVersion(entry, entry?.activeVersionId || "");
}

export function setActiveMicrosequenceVersion(entry, versionId) {
  const version = Array.isArray(entry?.versions) ? entry.versions.find((item) => item.id === versionId) : null;
  if (!version) {
    return null;
  }

  entry.activeVersionId = version.id;
  return version;
}
