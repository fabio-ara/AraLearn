function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
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

function normalizeVersionNumber(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizePublicNumber(value, fallback = 0) {
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

function normalizeLevel(level) {
  if (level === "project" || level === "course" || level === "module" || level === "lesson") {
    return level;
  }
  throw new Error(`Nível estrutural inválido para versionamento: "${level}".`);
}

function getChildField(level) {
  if (level === "project") return "courses";
  if (level === "course") return "modules";
  if (level === "module") return "lessons";
  return "microsequences";
}

function cloneSnapshot(level, entity) {
  const childField = getChildField(level);
  if (level === "project") {
    return {
      courses: Array.isArray(entity?.courses) ? structuredClone(entity.courses) : []
    };
  }

  return {
    title: entity?.title || "",
    ...(entity?.goal ? { goal: entity.goal } : {}),
    ...(entity?.guide ? { guide: structuredClone(entity.guide) } : {}),
    [childField]: Array.isArray(entity?.[childField]) ? structuredClone(entity[childField]) : []
  };
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

export function createStructureVersionRecord(
  level,
  entity,
  {
    id = "",
    entityKey = "",
    versionNumber = 1,
    label = "",
    operationType = "snapshot",
    parentVersionId = "",
    publicNumber = 0,
    createdAt,
    updatedAt,
    now = new Date()
  } = {}
) {
  const safeLevel = normalizeLevel(level);
  const safeVersionNumber = normalizeVersionNumber(versionNumber, 1);
  const createdIso = normalizeTimestamp(createdAt, nowIso(now));
  const updatedIso = normalizeTimestamp(updatedAt, createdIso);

  return {
    id: String(id || normalizeVersionId(safeVersionNumber)).trim() || normalizeVersionId(safeVersionNumber),
    versionNumber: safeVersionNumber,
    label: normalizeLabel(label, safeVersionNumber),
    operationType: normalizeOperationType(operationType),
    ...(parentVersionId ? { parentVersionId: String(parentVersionId).trim() } : {}),
    ...(normalizePublicNumber(publicNumber) ? { publicNumber: normalizePublicNumber(publicNumber) } : {}),
    level: safeLevel,
    entityKey: String(entityKey || entity?.id || "").trim(),
    snapshot: cloneSnapshot(safeLevel, entity),
    createdAt: createdIso,
    updatedAt: updatedIso
  };
}

export function normalizeStructureVersionEntry(entry, { now = new Date() } = {}) {
  const safeLevel = normalizeLevel(entry?.level || "lesson");
  const rawVersions = sortVersions(Array.isArray(entry?.versions) ? entry.versions.filter(Boolean) : []);
  if (!rawVersions.length) {
    return {
      level: safeLevel,
      entityKey: String(entry?.entityKey || "").trim(),
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
    const snapshot = version?.snapshot && typeof version.snapshot === "object" ? version.snapshot : version;
    return createStructureVersionRecord(safeLevel, snapshot, {
      id: normalizeStoredVersionId(version?.id, versionNumber),
      entityKey: entry?.entityKey || version?.entityKey || "",
      versionNumber,
      label: version?.label,
      operationType: version?.operationType || "migration",
      parentVersionId: version?.parentVersionId,
      publicNumber: version?.publicNumber,
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
    level: safeLevel,
    entityKey: String(entry?.entityKey || normalizedVersions[0]?.entityKey || "").trim(),
    activeVersionId: normalizedVersions[activeIndex]?.id || normalizedVersions.at(-1)?.id || "",
    versions: normalizedVersions
  };
}

export function replaceActiveStructureVersion(entry, entity, { now = new Date() } = {}) {
  const safeLevel = normalizeLevel(entry?.level || "lesson");
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const activeIndex = Math.max(0, versions.findIndex((version) => version.id === entry?.activeVersionId));
  const currentVersion = versions[activeIndex];
  if (!currentVersion) {
    return null;
  }

  const nextVersion = createStructureVersionRecord(safeLevel, entity, {
    id: currentVersion.id,
    entityKey: entry?.entityKey || currentVersion.entityKey || "",
    versionNumber: currentVersion.versionNumber || activeIndex + 1,
    label: currentVersion.label,
    operationType: currentVersion.operationType || "snapshot",
    parentVersionId: currentVersion.parentVersionId || "",
    publicNumber: currentVersion.publicNumber,
    createdAt: currentVersion.createdAt,
    updatedAt: now,
    now
  });

  entry.versions = versions.map((version, index) => (index === activeIndex ? nextVersion : version));
  entry.activeVersionId = nextVersion.id;
  return nextVersion;
}

export function insertStructureVersionAfterActive(
  entry,
  entity,
  {
    label = "",
    operationType = "snapshot",
    parentVersionId = "",
    now = new Date()
  } = {}
) {
  const safeLevel = normalizeLevel(entry?.level || "lesson");
  const versions = Array.isArray(entry?.versions) ? entry.versions.slice() : [];
  const lastVersion = getLastVersion(entry);
  const nextVersionNumber = normalizeVersionNumber(lastVersion?.versionNumber, versions.length) + 1;
  const insertedVersion = createStructureVersionRecord(safeLevel, entity, {
    entityKey: entry?.entityKey || entity?.id || "",
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

export function removeStructureVersion(entry, versionId) {
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

export function removeActiveStructureVersion(entry) {
  return removeStructureVersion(entry, entry?.activeVersionId || "");
}

export function setActiveStructureVersion(entry, versionId) {
  const version = Array.isArray(entry?.versions) ? entry.versions.find((item) => item.id === versionId) : null;
  if (!version) {
    return null;
  }

  entry.activeVersionId = version.id;
  return version;
}

export function normalizeStructureVersionMap(versionMap, { now = new Date() } = {}) {
  if (!versionMap || typeof versionMap !== "object") {
    return {};
  }

  const normalizedEntries = Object.entries(
    Object.fromEntries(
    Object.entries(versionMap)
      .map(([key, entry]) => [key, normalizeStructureVersionEntry(entry, { now })])
      .filter(([, entry]) => Array.isArray(entry.versions) && entry.versions.length > 0)
    )
  );
  const normalizedMap = Object.fromEntries(normalizedEntries);

  const recordsByLevel = new Map();
  Object.entries(normalizedMap).forEach(([entryKey, entry]) => {
    const level = entry?.level || "lesson";
    const records = recordsByLevel.get(level) || [];
    (entry?.versions || []).forEach((version, index) => {
      records.push({
        entryKey,
        index,
        version
      });
    });
    recordsByLevel.set(level, records);
  });

  recordsByLevel.forEach((records) => {
    const sortedRecords = records.slice().sort((left, right) => {
      const leftCreated = String(left.version?.createdAt || "");
      const rightCreated = String(right.version?.createdAt || "");
      if (leftCreated !== rightCreated) {
        return leftCreated.localeCompare(rightCreated);
      }

      const leftUpdated = String(left.version?.updatedAt || "");
      const rightUpdated = String(right.version?.updatedAt || "");
      if (leftUpdated !== rightUpdated) {
        return leftUpdated.localeCompare(rightUpdated);
      }

      const leftVersionNumber = normalizeVersionNumber(left.version?.versionNumber, left.index + 1);
      const rightVersionNumber = normalizeVersionNumber(right.version?.versionNumber, right.index + 1);
      if (leftVersionNumber !== rightVersionNumber) {
        return leftVersionNumber - rightVersionNumber;
      }

      const leftId = String(left.version?.id || "");
      const rightId = String(right.version?.id || "");
      if (leftId !== rightId) {
        return leftId.localeCompare(rightId);
      }

      return left.entryKey.localeCompare(right.entryKey);
    });

    const usedNumbers = new Set();
    const pending = [];
    sortedRecords.forEach((record) => {
      const publicNumber = normalizePublicNumber(record.version?.publicNumber);
      if (publicNumber && !usedNumbers.has(publicNumber)) {
        usedNumbers.add(publicNumber);
        return;
      }

      if (record.version && Object.prototype.hasOwnProperty.call(record.version, "publicNumber")) {
        delete record.version.publicNumber;
      }
      pending.push(record);
    });

    let nextNumber = usedNumbers.size ? Math.max(...usedNumbers) + 1 : 1;
    pending.forEach((record) => {
      while (usedNumbers.has(nextNumber)) {
        nextNumber += 1;
      }
      record.version.publicNumber = nextNumber;
      usedNumbers.add(nextNumber);
      nextNumber += 1;
    });
  });

  Object.keys(versionMap).forEach((key) => {
    if (!(key in normalizedMap)) {
      delete versionMap[key];
    }
  });
  normalizedEntries.forEach(([key, entry]) => {
    versionMap[key] = entry;
  });

  return versionMap;
}
