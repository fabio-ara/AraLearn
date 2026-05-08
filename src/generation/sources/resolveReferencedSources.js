import { normalizeAttachedSources, sourceForContract } from "./attachedSources.js";

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveReferencedSources({
  userPrompt = "",
  attachedSources = [],
  userSelectedSourceIds = [],
  singleUnreferencedSourcePolicy = "assume"
}) {
  const sources = normalizeAttachedSources(attachedSources);
  const sourceById = new Map(sources.map((item) => [item.sourceId, item]));
  const selected = (userSelectedSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
  const unresolvedReferences = [];

  if (selected.length) {
    return {
      referencedSources: selected.map((item) => sourceForContract(item)),
      unresolvedReferences,
      shouldAskUserToSelectSource: false
    };
  }

  const prompt = normalizeForMatch(userPrompt);
  const mentioned = sources.filter((source) => {
    const fullName = normalizeForMatch(source.displayName);
    const stem = fullName.replace(/\.[a-z0-9]+$/, "");
    return fullName && (prompt.includes(fullName) || (stem.length >= 3 && prompt.includes(stem)));
  });

  if (mentioned.length === 1) {
    return {
      referencedSources: mentioned.map((item) => sourceForContract(item)),
      unresolvedReferences,
      shouldAskUserToSelectSource: false
    };
  }
  if (mentioned.length > 1) {
    return {
      referencedSources: [],
      unresolvedReferences: mentioned.map((item) => item.displayName),
      shouldAskUserToSelectSource: true
    };
  }
  if (sources.length > 1) {
    return {
      referencedSources: [],
      unresolvedReferences,
      shouldAskUserToSelectSource: true
    };
  }
  if (sources.length === 1 && singleUnreferencedSourcePolicy === "assume") {
    return {
      referencedSources: [sourceForContract(sources[0])],
      unresolvedReferences,
      shouldAskUserToSelectSource: false
    };
  }
  return {
    referencedSources: [],
    unresolvedReferences,
    shouldAskUserToSelectSource: sources.length === 1
  };
}
