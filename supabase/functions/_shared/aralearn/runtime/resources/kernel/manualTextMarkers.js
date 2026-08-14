const MANUAL_TEXT_START = "\uE100";
const MANUAL_TEXT_SEPARATOR = "\uE101";
const MANUAL_TEXT_END = "\uE102";
const GAP_TEXT_START = "\uE000";
const MANUAL_MARKER_NONCE = globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const MANUAL_MARKER_SIGNATURE = `AraLearnManualText/1:${MANUAL_MARKER_NONCE}:`;
const MANUAL_PATH_PATTERN = /^[A-Za-z_$][\w$]*(?:\[\d+\]|\.[A-Za-z_$][\w$]*)*$/u;
const RESERVED_MANUAL_TEXT = /[\uE100-\uE102]/u;
const issuedMarkers = new Set();
const issuedMarkerOrder = [];
const MAX_ISSUED_MARKERS = 8192;

function markerPattern() {
  return /\uE100([^\uE101]*)\uE101([\s\S]*?)\uE102/gu;
}

function parsePath(path) {
  return (String(path || "").match(/[^.[\]]+|\[(\d+)\]/gu) || [])
    .map((segment) => segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment);
}

function readPath(root, path) {
  return parsePath(path).reduce((current, segment) => current?.[segment], root);
}

function writePath(root, path, value) {
  const segments = parsePath(path);
  const leaf = segments.pop();
  if (leaf === undefined) return false;
  const parent = segments.reduce((current, segment) => current?.[segment], root);
  if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, leaf)) return false;
  parent[leaf] = value;
  return true;
}

function decodeMarkerPath(value) {
  if (!String(value || "").startsWith(MANUAL_MARKER_SIGNATURE)) return "";
  try {
    return decodeURIComponent(String(value).slice(MANUAL_MARKER_SIGNATURE.length));
  } catch {
    return "";
  }
}

function rememberIssuedMarker(marker) {
  if (issuedMarkers.has(marker)) return;
  issuedMarkers.add(marker);
  issuedMarkerOrder.push(marker);
  while (issuedMarkerOrder.length > MAX_ISSUED_MARKERS) {
    issuedMarkers.delete(issuedMarkerOrder.shift());
  }
}

export function createPackageManualTextMarker(path, value) {
  const normalizedPath = String(path || "").trim();
  const source = String(value ?? "");
  if (!MANUAL_PATH_PATTERN.test(normalizedPath) || source.includes(GAP_TEXT_START)) return source;
  // Private-use sentinels belong exclusively to the transient render copy. Treat
  // author-provided collisions as inert text and fail closed instead of projecting
  // them as editable metadata.
  if (RESERVED_MANUAL_TEXT.test(source)) return source;
  const marker = MANUAL_TEXT_START + MANUAL_MARKER_SIGNATURE +
    encodeURIComponent(normalizedPath) + MANUAL_TEXT_SEPARATOR + source + MANUAL_TEXT_END;
  rememberIssuedMarker(marker);
  return marker;
}

export function parsePackageManualTextSegments(value) {
  const source = String(value ?? "");
  const segments = [];
  let cursor = 0;
  for (const match of source.matchAll(markerPattern())) {
    if (Number(match.index) > cursor) {
      segments.push({ path: "", value: source.slice(cursor, match.index) });
    }
    const decodedPath = issuedMarkers.has(match[0]) ? decodeMarkerPath(match[1]) : "";
    const path = MANUAL_PATH_PATTERN.test(decodedPath) ? decodedPath : "";
    segments.push({ path, value: path ? match[2] : match[0] });
    cursor = Number(match.index) + match[0].length;
  }
  if (cursor < source.length) segments.push({ path: "", value: source.slice(cursor) });
  return segments.length ? segments : [{ path: "", value: source }];
}

export function stripPackageManualTextMarkers(value) {
  return parsePackageManualTextSegments(value).map(({ value: segment }) => segment).join("");
}

export function listPackageManualTextPaths(value) {
  return parsePackageManualTextSegments(value)
    .map(({ path }) => path)
    .filter(Boolean);
}

export function hasPackageManualTextMarker(value) {
  return listPackageManualTextPaths(value).length > 0;
}

export function instrumentPackageManualTextTargets(data, targets = []) {
  const instrumented = structuredClone(data);
  targets.forEach((target) => {
    const path = String(target?.path || "").trim();
    const current = readPath(instrumented, path);
    if (!path || typeof current !== "string") return;
    writePath(instrumented, path, createPackageManualTextMarker(path, current));
  });
  return instrumented;
}

export function stripPackageManualTextMarkersDeep(value) {
  if (typeof value === "string") return stripPackageManualTextMarkers(value);
  if (Array.isArray(value)) return value.map(stripPackageManualTextMarkersDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    stripPackageManualTextMarkersDeep(child)
  ]));
}
