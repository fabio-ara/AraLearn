export function parseBlockPath(path) {
  return String(path || "")
    .split(".")
    .map((item) => (/^\d+$/.test(item) ? Number.parseInt(item, 10) : item))
    .filter((item) => item !== "");
}

export function cloneBlocks(blocks) {
  return structuredClone(blocks);
}

export function getBlockAtPath(blocks, path) {
  const segments = parseBlockPath(path);
  let current = blocks;

  for (const segment of segments) {
    if (current === undefined || current === null) {
      return null;
    }
    current = current[segment];
  }

  return current ?? null;
}

export function getParentArrayAtPath(blocks, path) {
  const segments = parseBlockPath(path);
  if (!segments.length) {
    return null;
  }

  const itemIndex = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  let current = blocks;

  for (const segment of parentSegments) {
    if (current === undefined || current === null) {
      return null;
    }
    current = current[segment];
  }

  return Array.isArray(current) ? { array: current, index: itemIndex } : null;
}
