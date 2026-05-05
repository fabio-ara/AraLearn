function clamp(value, min, max) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return min;
  return Math.max(min, Math.min(max, safe));
}

export function computeFlowchartAutoFitScale({
  viewportWidth,
  viewportHeight,
  baseWidth,
  baseHeight,
  preferredScale = 1,
  padding = 12,
  minScale = 0.2,
  maxScale = 1.2
}) {
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const safeBaseWidth = Math.max(1, Number(baseWidth) || 1);
  const safeBaseHeight = Math.max(1, Number(baseHeight) || 1);
  const safePadding = Math.max(0, Number(padding) || 0);

  const availableWidth = Math.max(1, safeViewportWidth - safePadding * 2);
  const availableHeight = Math.max(1, safeViewportHeight - safePadding * 2);

  const fitScale = Math.min(availableWidth / safeBaseWidth, availableHeight / safeBaseHeight);
  const target = Math.min(Number(preferredScale) || 1, fitScale);
  return clamp(target, minScale, maxScale);
}

