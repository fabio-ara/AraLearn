const PACKAGE_PRACTICE_MARKERS = Symbol("aralearn.packagePracticeMarkers");

export function setPackagePracticeMarker(data, targetPath, marker) {
  if (!data || typeof data !== "object") return;
  if (!data[PACKAGE_PRACTICE_MARKERS]) {
    Object.defineProperty(data, PACKAGE_PRACTICE_MARKERS, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new Map()
    });
  }
  data[PACKAGE_PRACTICE_MARKERS].set(String(targetPath || ""), String(marker ?? ""));
}

export function getPackagePracticeMarker(data, targetPath) {
  return data?.[PACKAGE_PRACTICE_MARKERS]?.get(String(targetPath || "")) ?? null;
}
