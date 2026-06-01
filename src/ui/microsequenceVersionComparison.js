function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clampCardIndex(cards, targetIndex = 0) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) {
    return 0;
  }

  const numericIndex = Number.isInteger(targetIndex) ? targetIndex : 0;
  return Math.max(0, Math.min(numericIndex, list.length - 1));
}

function sameRefs(leftRefs, rightRefs) {
  return JSON.stringify(Array.isArray(leftRefs) ? leftRefs : []) === JSON.stringify(Array.isArray(rightRefs) ? rightRefs : []);
}

function sameCard(leftCard, rightCard) {
  if (!leftCard || !rightCard) {
    return false;
  }

  return JSON.stringify(leftCard) === JSON.stringify(rightCard);
}

function resolveCardStatus(previousCard, currentCard) {
  if (!previousCard && currentCard) return "added";
  if (previousCard && !currentCard) return "removed";
  if (!previousCard && !currentCard) return "empty";
  if (sameCard(previousCard, currentCard)) return "unchanged";
  return "changed";
}

function buildCardCompositionMap(cards) {
  return new Map(
    (Array.isArray(cards) ? cards : []).map((card, index) => [
      String(card?.id || `card-${index}`),
      { card, index }
    ])
  );
}

function summarizeCompositionChange(kind, key, previousEntry, currentEntry) {
  const previousCard = previousEntry?.card || null;
  const currentCard = currentEntry?.card || null;
  const title =
    currentCard?.title ||
    previousCard?.title ||
    currentCard?.id ||
    previousCard?.id ||
    key;

  return {
    kind,
    key,
    title,
    previousIndex: Number.isInteger(previousEntry?.index) ? previousEntry.index : null,
    currentIndex: Number.isInteger(currentEntry?.index) ? currentEntry.index : null
  };
}

function compareComposition(previousCards, currentCards) {
  const previousMap = buildCardCompositionMap(previousCards);
  const currentMap = buildCardCompositionMap(currentCards);
  const allKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);
  const changes = [];

  allKeys.forEach((key) => {
    const previousEntry = previousMap.get(key) || null;
    const currentEntry = currentMap.get(key) || null;
    if (!previousEntry && currentEntry) {
      changes.push(summarizeCompositionChange("added", key, previousEntry, currentEntry));
      return;
    }
    if (previousEntry && !currentEntry) {
      changes.push(summarizeCompositionChange("removed", key, previousEntry, currentEntry));
      return;
    }
    if (!previousEntry || !currentEntry) {
      return;
    }

    if (previousEntry.index !== currentEntry.index) {
      changes.push(summarizeCompositionChange("moved", key, previousEntry, currentEntry));
      return;
    }

    if (!sameCard(previousEntry.card, currentEntry.card)) {
      changes.push(summarizeCompositionChange("changed", key, previousEntry, currentEntry));
    }
  });

  const totals = {
    added: changes.filter((item) => item.kind === "added").length,
    removed: changes.filter((item) => item.kind === "removed").length,
    moved: changes.filter((item) => item.kind === "moved").length,
    changed: changes.filter((item) => item.kind === "changed").length
  };

  return {
    changed: changes.length > 0,
    totals,
    changes
  };
}

function buildSummaryItem({ id, title, lines = [], target = null, canOpenPrevious = true, canOpenCurrent = true, canCompare = true }) {
  return {
    id,
    title,
    lines,
    target,
    canOpenPrevious,
    canOpenCurrent,
    canCompare
  };
}

function buildSummaryEntries({ previousVersion, currentVersion, composition, titleChanged, refsChanged }) {
  const entries = [];

  if (titleChanged) {
    entries.push(
      buildSummaryItem({
        id: "microsequence-title-changed",
        title: "Microssequência alterada",
        lines: ["Título alterado"],
        target: { scope: "microsequence" }
      })
    );
  }

  if (refsChanged) {
    entries.push(
      buildSummaryItem({
        id: "microsequence-refs-changed",
        title: "Microssequência alterada",
        lines: ["Refs alteradas"],
        target: { scope: "microsequence" }
      })
    );
  }

  composition.changes.forEach((item, index) => {
    const kindTitle =
      item.kind === "added"
        ? "Card adicionado"
        : item.kind === "removed"
          ? "Card removido"
          : item.kind === "moved"
            ? "Card reordenado"
            : "Card alterado";
    const positionLine =
      item.kind === "added"
        ? `Entra na posição ${item.currentIndex + 1}`
        : item.kind === "removed"
          ? `Sai da posição ${item.previousIndex + 1}`
          : item.kind === "moved"
            ? `Posição ${item.previousIndex + 1} → ${item.currentIndex + 1}`
            : `Card ${item.title}`;

    entries.push(
      buildSummaryItem({
        id: `card-change-${index}`,
        title: kindTitle,
        lines: [`Card: ${item.title}`, positionLine],
        target: {
          scope: "card",
          cardKey: item.key,
          previousIndex: item.previousIndex,
          currentIndex: item.currentIndex
        },
        canOpenPrevious: item.kind !== "added",
        canOpenCurrent: item.kind !== "removed",
        canCompare: item.kind !== "added" && item.kind !== "removed"
      })
    );
  });

  if (!entries.length) {
    entries.push(
      buildSummaryItem({
        id: "microsequence-no-relevant-change",
        title: "Sem mudança relevante",
        lines: ["A microssequência permanece igual entre as duas versões."],
        target: { scope: "microsequence" }
      })
    );
  }

  return entries;
}

export function buildMicrosequenceVersionComparison({ versions = [], activeVersionId = "", cardIndex = 0 } = {}) {
  return buildMicrosequenceVersionComparisonForVersion({
    versions,
    versionId: activeVersionId,
    cardIndex
  });
}

export function buildMicrosequenceVersionComparisonForVersion({ versions = [], versionId = "", cardIndex = 0 } = {}) {
  if (!Array.isArray(versions) || versions.length <= 1 || !versionId) {
    return null;
  }

  const currentIndex = versions.findIndex((version) => version?.id === versionId);
  if (currentIndex <= 0) {
    return null;
  }

  const currentVersion = versions[currentIndex] || null;
  const previousVersion =
    versions.find((version) => version?.id === currentVersion?.parentVersionId) ||
    versions[currentIndex - 1] ||
    null;
  if (!previousVersion || !currentVersion) {
    return null;
  }

  const currentCards = Array.isArray(currentVersion.cards) ? currentVersion.cards : [];
  const previousCards = Array.isArray(previousVersion.cards) ? previousVersion.cards : [];
  const versionTitleById = new Map(
    (Array.isArray(versions) ? versions : [])
      .map((version) => [String(version?.id || "").trim(), version?.title || ""])
      .filter(([id, title]) => id && title)
  );
  const resolveDependsOnTitles = (dependsOn = []) =>
    (Array.isArray(dependsOn) ? dependsOn : [])
      .map((dependencyId) => versionTitleById.get(String(dependencyId || "").trim()) || "")
      .filter(Boolean);
  const safeCardIndex = clampCardIndex(currentCards, cardIndex);
  const currentCard = currentCards[safeCardIndex] || null;
  const previousCard = previousCards[safeCardIndex] || null;
  const cardStatus = resolveCardStatus(previousCard, currentCard);
  const composition = compareComposition(previousCards, currentCards);
  const titleChanged = normalizeText(previousVersion.title) !== normalizeText(currentVersion.title);
  const refsChanged = !sameRefs(previousVersion.dependsOn, currentVersion.dependsOn);

  return {
    kind: "microsequence",
    previousVersion: {
      id: previousVersion.id || "",
      label: previousVersion.label || previousVersion.id || "Versão anterior",
      title: previousVersion.title || "",
      dependsOn: Array.isArray(previousVersion.dependsOn) ? previousVersion.dependsOn : [],
      dependsOnTitles: resolveDependsOnTitles(previousVersion.dependsOn),
      cards: previousCards,
      cardCount: previousCards.length
    },
    currentVersion: {
      id: currentVersion.id || "",
      label: currentVersion.label || currentVersion.id || "Versão atual",
      title: currentVersion.title || "",
      dependsOn: Array.isArray(currentVersion.dependsOn) ? currentVersion.dependsOn : [],
      dependsOnTitles: resolveDependsOnTitles(currentVersion.dependsOn),
      cards: currentCards,
      cardCount: currentCards.length
    },
    summary: {
      titleChanged,
      refsChanged,
      cardCountDelta: currentCards.length - previousCards.length,
      cardStatus
    },
    summaryEntries: buildSummaryEntries({
      previousVersion,
      currentVersion,
      composition,
      titleChanged,
      refsChanged
    }),
    composition,
    selectedCard: {
      cardIndex: safeCardIndex,
      previousCard,
      currentCard,
      status: cardStatus
    }
  };
}
