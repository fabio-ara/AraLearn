function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferSourceKind(name = "", mimeType = "") {
  const lowerName = normalizeText(name).toLowerCase();
  const lowerMime = normalizeText(mimeType).toLowerCase();
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(lowerName)) return "image";
  if (lowerMime.startsWith("text/") || /\.(txt|md|csv|json|xml|html|js|ts|py|java|c|cpp)$/.test(lowerName)) return "text";
  return "other";
}

export function createAttachedSource(source, index = 0) {
  const displayName = normalizeText(source?.displayName) || normalizeText(source?.name) || `Anexo ${index + 1}`;
  return {
    sourceId: normalizeText(source?.sourceId) || `source-${index + 1}`,
    displayName,
    kind: ["pdf", "image", "text", "other"].includes(source?.kind)
      ? source.kind
      : inferSourceKind(displayName, source?.type || source?.mimeType),
    status: "attached",
    metadata: {
      size: Number(source?.size || 0),
      mimeType: normalizeText(source?.type || source?.mimeType),
      lastModified: Number(source?.lastModified || 0)
    },
    file: source?.file || (typeof source?.arrayBuffer === "function" ? source : null)
  };
}

export function normalizeAttachedSources(sources = []) {
  return (sources || []).map(createAttachedSource);
}

export function sourceForContract(source, usage = "planning_and_generation") {
  return {
    sourceId: source.sourceId,
    displayName: source.displayName,
    kind: source.kind,
    usage
  };
}
