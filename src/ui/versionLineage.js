function normalizeVersionNumber(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function readVersionNumberFromId(id) {
  const match = String(id || "").trim().match(/^v(\d+)$/i);
  if (!match) {
    return 0;
  }

  return normalizeVersionNumber(Number.parseInt(match[1], 10));
}

export function getVersionDisplayId(version, fallbackIndex = 0) {
  if (String(version?.id || "").trim()) {
    return String(version.id).trim();
  }

  const versionNumber = normalizeVersionNumber(version?.versionNumber) || fallbackIndex + 1;
  return `v${versionNumber}`;
}

export function getScopedVersionDisplayId(version, prefix = "V", fallbackIndex = 0) {
  const versionNumber =
    normalizeVersionNumber(version?.publicNumber) ||
    normalizeVersionNumber(version?.versionNumber) ||
    readVersionNumberFromId(version?.id) ||
    fallbackIndex + 1;
  return `${String(prefix || "V").trim() || "V"}${versionNumber}`;
}

export function buildVersionLineageLabel(version, versions = [], fallbackIndex = 0) {
  const currentId = getVersionDisplayId(version, fallbackIndex);
  const parentId = String(version?.parentVersionId || "").trim();
  if (!parentId) {
    return currentId;
  }

  const hasParent = (Array.isArray(versions) ? versions : []).some((item) => getVersionDisplayId(item) === parentId);
  return hasParent ? `${parentId} → ${currentId}` : currentId;
}

export function buildScopedVersionLineageLabel(version, versions = [], prefix = "V", fallbackIndex = 0) {
  const currentId = getScopedVersionDisplayId(version, prefix, fallbackIndex);
  const parentId = String(version?.parentVersionId || "").trim();
  if (!parentId) {
    return currentId;
  }

  const parentVersion = (Array.isArray(versions) ? versions : []).find((item) => getVersionDisplayId(item) === parentId);
  if (!parentVersion) {
    return currentId;
  }

  return `${getScopedVersionDisplayId(parentVersion, prefix)} → ${currentId}`;
}

export function splitVersionLineageLabel(label = "") {
  const text = String(label || "").trim();
  if (!text) {
    return {
      origin: "",
      destination: ""
    };
  }

  const arrowIndex = text.lastIndexOf("→");
  if (arrowIndex < 0) {
    return {
      origin: "",
      destination: text
    };
  }

  return {
    origin: text.slice(0, arrowIndex + 1).trim(),
    destination: text.slice(arrowIndex + 1).trim()
  };
}

export function compareVersionsByNumber(left, right) {
  const leftNumber = normalizeVersionNumber(left?.versionNumber) || readVersionNumberFromId(left?.id);
  const rightNumber = normalizeVersionNumber(right?.versionNumber) || readVersionNumberFromId(right?.id);
  return leftNumber - rightNumber;
}
