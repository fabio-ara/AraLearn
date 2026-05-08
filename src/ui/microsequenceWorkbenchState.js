function clampCardIndex(cards, targetIndex = 0) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) {
    return 0;
  }

  const numericIndex = Number.isInteger(targetIndex) ? targetIndex : 0;
  return Math.max(0, Math.min(numericIndex, list.length - 1));
}

export function resolveMicrosequenceAssistOpenState(entry, targetIndex = 0) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const activeVersion = versions.at(-1) || null;

  return {
    activeVersionId: activeVersion?.id || "",
    cardIndex: clampCardIndex(activeVersion?.cards, targetIndex),
    activeWorkbenchPane: "preview"
  };
}

export function resolveWorkbenchPaneAfterCardSelection(view, currentPane) {
  if (view === "microsequence-assist") {
    return "preview";
  }

  return currentPane === "edit" ? "edit" : "preview";
}
