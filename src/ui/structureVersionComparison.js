function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readChildren(entity, childField) {
  return Array.isArray(entity?.[childField]) ? entity[childField] : [];
}

function countLessonsInCourse(course) {
  return readChildren(course, "modules").reduce((total, moduleValue) => total + readChildren(moduleValue, "lessons").length, 0);
}

function countMicrosequencesInCourse(course) {
  return readChildren(course, "modules").reduce(
    (total, moduleValue) =>
      total +
      readChildren(moduleValue, "lessons").reduce(
        (lessonTotal, lesson) => lessonTotal + readChildren(lesson, "microsequences").length,
        0
      ),
    0
  );
}

function countMicrosequencesInModule(moduleValue) {
  return readChildren(moduleValue, "lessons").reduce(
    (total, lesson) => total + readChildren(lesson, "microsequences").length,
    0
  );
}

function countNestedCards(entity, childField) {
  const children = readChildren(entity, childField);
  if (childField === "microsequences") {
    return children.reduce((total, item) => total + (Array.isArray(item?.cards) ? item.cards.length : 0), 0);
  }
  if (childField === "lessons") {
    return children.reduce(
      (total, item) =>
        total +
        (Array.isArray(item?.microsequences)
          ? item.microsequences.reduce((sum, microsequence) => sum + (Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0), 0)
          : 0),
      0
    );
  }
  if (childField === "modules") {
    return children.reduce(
      (total, item) =>
        total +
        (Array.isArray(item?.lessons)
          ? item.lessons.reduce(
              (lessonTotal, lesson) =>
                lessonTotal +
                (Array.isArray(lesson?.microsequences)
                  ? lesson.microsequences.reduce((sum, microsequence) => sum + (Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0), 0)
                  : 0),
              0
            )
          : 0),
      0
    );
  }
  return 0;
}

function buildChildMap(items) {
  return new Map(
    (Array.isArray(items) ? items : []).map((item, index) => [
      String(item?.key || `item-${index}`),
      { item, index }
    ])
  );
}

function summarizeChange(kind, key, previousEntry, currentEntry) {
  const previousItem = previousEntry?.item || null;
  const currentItem = currentEntry?.item || null;
  return {
    kind,
    key,
    title: currentItem?.title || previousItem?.title || key,
    previousIndex: Number.isInteger(previousEntry?.index) ? previousEntry.index : null,
    currentIndex: Number.isInteger(currentEntry?.index) ? currentEntry.index : null
  };
}

function compareChildren(previousItems, currentItems) {
  const previousMap = buildChildMap(previousItems);
  const currentMap = buildChildMap(currentItems);
  const allKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);
  const changes = [];

  allKeys.forEach((key) => {
    const previousEntry = previousMap.get(key) || null;
    const currentEntry = currentMap.get(key) || null;
    if (!previousEntry && currentEntry) {
      changes.push(summarizeChange("added", key, previousEntry, currentEntry));
      return;
    }
    if (previousEntry && !currentEntry) {
      changes.push(summarizeChange("removed", key, previousEntry, currentEntry));
      return;
    }
    if (!previousEntry || !currentEntry) {
      return;
    }
    if (previousEntry.index !== currentEntry.index) {
      changes.push(summarizeChange("moved", key, previousEntry, currentEntry));
      return;
    }
    if (!sameValue(previousEntry.item, currentEntry.item)) {
      changes.push(summarizeChange("changed", key, previousEntry, currentEntry));
    }
  });

  return {
    changed: changes.length > 0,
    totals: {
      added: changes.filter((item) => item.kind === "added").length,
      removed: changes.filter((item) => item.kind === "removed").length,
      moved: changes.filter((item) => item.kind === "moved").length,
      changed: changes.filter((item) => item.kind === "changed").length
    },
    changes
  };
}

function getLevelConfig(level) {
  if (level === "course") return { levelLabel: "Curso", childField: "modules", childLabel: "Módulos" };
  if (level === "module") return { levelLabel: "Módulo", childField: "lessons", childLabel: "Lições" };
  if (level === "lesson") return { levelLabel: "Lição", childField: "microsequences", childLabel: "Microssequências" };
  throw new Error(`Nível estrutural inválido para comparação: "${level}".`);
}

function buildMetric(label, previous, current) {
  return {
    label,
    previous,
    current,
    delta: current - previous
  };
}

function buildLevelMetrics(level, previousEntity, currentEntity) {
  if (level === "course") {
    return [
      buildMetric("Módulos", readChildren(previousEntity, "modules").length, readChildren(currentEntity, "modules").length),
      buildMetric("Lições", countLessonsInCourse(previousEntity), countLessonsInCourse(currentEntity)),
      buildMetric("Microssequências", countMicrosequencesInCourse(previousEntity), countMicrosequencesInCourse(currentEntity)),
      buildMetric("Cards", countNestedCards(previousEntity, "modules"), countNestedCards(currentEntity, "modules"))
    ];
  }

  if (level === "module") {
    return [
      buildMetric("Lições", readChildren(previousEntity, "lessons").length, readChildren(currentEntity, "lessons").length),
      buildMetric("Microssequências", countMicrosequencesInModule(previousEntity), countMicrosequencesInModule(currentEntity)),
      buildMetric("Cards", countNestedCards(previousEntity, "lessons"), countNestedCards(currentEntity, "lessons"))
    ];
  }

  return [
    buildMetric(
      "Microssequências",
      readChildren(previousEntity, "microsequences").length,
      readChildren(currentEntity, "microsequences").length
    ),
    buildMetric("Cards", countNestedCards(previousEntity, "microsequences"), countNestedCards(currentEntity, "microsequences"))
  ];
}

function buildMetadataSummary(metadata) {
  return [
    metadata.titleChanged ? "Título" : "",
    metadata.descriptionChanged ? "Descrição" : "",
    metadata.sourceGuideChanged ? "Fonte-guia" : ""
  ].filter(Boolean);
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

function levelTitle(scope) {
  if (scope === "course") return "Curso";
  if (scope === "module") return "Módulo";
  if (scope === "lesson") return "Lição";
  if (scope === "microsequence") return "Microssequência";
  return "Card";
}

function pluralTitle(scope) {
  if (scope === "module") return "módulos";
  if (scope === "lesson") return "lições";
  if (scope === "microsequence") return "microssequências";
  if (scope === "card") return "cards";
  return "itens";
}

function buildContextLines(pathTitles = {}, itemTitle = "") {
  const lines = [];
  if (pathTitles.moduleTitle) lines.push(`Módulo: ${pathTitles.moduleTitle}`);
  if (pathTitles.lessonTitle) lines.push(`Lição: ${pathTitles.lessonTitle}`);
  if (pathTitles.microsequenceTitle) lines.push(`Microssequência: ${pathTitles.microsequenceTitle}`);
  if (itemTitle) lines.push(`${itemTitle}`);
  return lines;
}

function createTarget(scope, pathKeys = {}, extra = {}) {
  return {
    scope,
    courseKey: pathKeys.courseKey || "",
    moduleKey: pathKeys.moduleKey || "",
    lessonKey: pathKeys.lessonKey || "",
    microsequenceKey: pathKeys.microsequenceKey || "",
    ...extra
  };
}

function collectCardSummaryEntries(previousCards, currentCards, pathTitles, pathKeys) {
  const composition = compareChildren(previousCards, currentCards);
  const items = [];

  composition.changes.forEach((change, index) => {
    const title =
      change.kind === "added"
        ? "Card adicionado"
        : change.kind === "removed"
          ? "Card removido"
          : change.kind === "moved"
            ? "Card reordenado"
            : "Card alterado";
    items.push(
      buildSummaryItem({
        id: `card-${pathKeys.microsequenceKey || "micro"}-${index}`,
        title,
        lines: buildContextLines(pathTitles, `Card: ${change.title}`),
        target: createTarget("card", pathKeys, {
          cardKey: change.key,
          previousIndex: change.previousIndex,
          currentIndex: change.currentIndex
        }),
        canOpenPrevious: change.kind !== "added",
        canOpenCurrent: change.kind !== "removed",
        canCompare: change.kind !== "added" && change.kind !== "removed"
      })
    );
  });

  return items;
}

function collectStructureSummaryEntries(level, previousEntity, currentEntity, pathTitles = {}, pathKeys = {}) {
  const items = [];
  const metadata = {
    titleChanged: normalizeText(previousEntity?.title) !== normalizeText(currentEntity?.title),
    descriptionChanged: normalizeText(previousEntity?.description) !== normalizeText(currentEntity?.description),
    sourceGuideChanged: normalizeText(previousEntity?.sourceGuide) !== normalizeText(currentEntity?.sourceGuide)
  };
  const changedFields = buildMetadataSummary(metadata);

  if (changedFields.length) {
    items.push(
      buildSummaryItem({
        id: `${level}-metadata`,
        title: `${levelTitle(level)} alterado`,
        lines: [`Informações alteradas: ${changedFields.join(", ")}`],
        target: createTarget(level, pathKeys)
      })
    );
  }

  if (level === "lesson") {
    items.push(
      ...collectMicrosequenceSummaryEntries(
        readChildren(previousEntity, "microsequences"),
        readChildren(currentEntity, "microsequences"),
        pathTitles,
        pathKeys
      )
    );
    return items;
  }

  const childField = level === "course" ? "modules" : "lessons";
  const nextLevel = level === "course" ? "module" : "lesson";
  const previousMap = buildChildMap(readChildren(previousEntity, childField));
  const currentMap = buildChildMap(readChildren(currentEntity, childField));
  const allKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);

  allKeys.forEach((key) => {
    const previousEntry = previousMap.get(key) || null;
    const currentEntry = currentMap.get(key) || null;
    const previousItem = previousEntry?.item || null;
    const currentItem = currentEntry?.item || null;
    const title = currentItem?.title || previousItem?.title || key;
    const nextPathTitles =
      nextLevel === "module"
        ? { ...pathTitles, moduleTitle: title }
        : { ...pathTitles, lessonTitle: title };
    const nextPathKeys =
      nextLevel === "module"
        ? { ...pathKeys, moduleKey: currentItem?.key || previousItem?.key || key }
        : { ...pathKeys, lessonKey: currentItem?.key || previousItem?.key || key };

    if (!previousItem && currentItem) {
      items.push(
        buildSummaryItem({
          id: `${nextLevel}-added-${key}`,
          title: `${levelTitle(nextLevel)} adicionada`,
          lines: buildContextLines(pathTitles, `${levelTitle(nextLevel)}: ${title}`),
          target: createTarget(nextLevel, nextPathKeys),
          canOpenPrevious: false,
          canOpenCurrent: true,
          canCompare: false
        })
      );
      return;
    }

    if (previousItem && !currentItem) {
      items.push(
        buildSummaryItem({
          id: `${nextLevel}-removed-${key}`,
          title: `${levelTitle(nextLevel)} removida`,
          lines: buildContextLines(pathTitles, `${levelTitle(nextLevel)}: ${title}`),
          target: createTarget(nextLevel, nextPathKeys),
          canOpenPrevious: true,
          canOpenCurrent: false,
          canCompare: false
        })
      );
      return;
    }

    if (!previousItem || !currentItem || sameValue(previousItem, currentItem)) {
      return;
    }

    items.push(
      buildSummaryItem({
        id: `${nextLevel}-changed-${key}`,
        title: `${levelTitle(nextLevel)} alterada`,
        lines: buildContextLines(pathTitles, `${levelTitle(nextLevel)}: ${title}`),
        target: createTarget(nextLevel, nextPathKeys)
      })
    );

    items.push(...collectStructureSummaryEntries(nextLevel, previousItem, currentItem, nextPathTitles, nextPathKeys));
  });

  return items;
}

function collectMicrosequenceSummaryEntries(previousMicrosequences, currentMicrosequences, pathTitles = {}, pathKeys = {}) {
  const items = [];
  const previousMap = buildChildMap(previousMicrosequences);
  const currentMap = buildChildMap(currentMicrosequences);
  const allKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);

  allKeys.forEach((key) => {
    const previousEntry = previousMap.get(key) || null;
    const currentEntry = currentMap.get(key) || null;
    const previousItem = previousEntry?.item || null;
    const currentItem = currentEntry?.item || null;
    const title = currentItem?.title || previousItem?.title || key;
    const nextPathTitles = { ...pathTitles, microsequenceTitle: title };
    const nextPathKeys = { ...pathKeys, microsequenceKey: currentItem?.key || previousItem?.key || key };

    if (!previousItem && currentItem) {
      items.push(
        buildSummaryItem({
          id: `microsequence-added-${key}`,
          title: "Microssequência adicionada",
          lines: buildContextLines(pathTitles, `Microssequência: ${title}`),
          target: createTarget("microsequence", nextPathKeys),
          canOpenPrevious: false,
          canOpenCurrent: true,
          canCompare: false
        })
      );
      return;
    }

    if (previousItem && !currentItem) {
      items.push(
        buildSummaryItem({
          id: `microsequence-removed-${key}`,
          title: "Microssequência removida",
          lines: buildContextLines(pathTitles, `Microssequência: ${title}`),
          target: createTarget("microsequence", nextPathKeys),
          canOpenPrevious: true,
          canOpenCurrent: false,
          canCompare: false
        })
      );
      return;
    }

    if (!previousItem || !currentItem || sameValue(previousItem, currentItem)) {
      return;
    }

    items.push(
      buildSummaryItem({
        id: `microsequence-changed-${key}`,
        title: "Microssequência alterada",
        lines: buildContextLines(pathTitles, `Microssequência: ${title}`),
        target: createTarget("microsequence", nextPathKeys)
      })
    );
    items.push(
      ...collectCardSummaryEntries(
        Array.isArray(previousItem.cards) ? previousItem.cards : [],
        Array.isArray(currentItem.cards) ? currentItem.cards : [],
        nextPathTitles,
        nextPathKeys
      )
    );
  });

  return items;
}

export function buildStructureVersionComparison({ level, previousEntity, currentEntity }) {
  const config = getLevelConfig(level);
  const previousChildren = readChildren(previousEntity, config.childField);
  const currentChildren = readChildren(currentEntity, config.childField);
  const metadata = {
    titleChanged: normalizeText(previousEntity?.title) !== normalizeText(currentEntity?.title),
    descriptionChanged: normalizeText(previousEntity?.description) !== normalizeText(currentEntity?.description),
    sourceGuideChanged: normalizeText(previousEntity?.sourceGuide) !== normalizeText(currentEntity?.sourceGuide)
  };
  const metrics = buildLevelMetrics(level, previousEntity, currentEntity);

  return {
    level,
    levelLabel: config.levelLabel,
    childField: config.childField,
    childLabel: config.childLabel,
    metadata,
    metadataSummary: buildMetadataSummary(metadata),
    counts: {
      previousChildren: previousChildren.length,
      currentChildren: currentChildren.length,
      childDelta: currentChildren.length - previousChildren.length,
      previousNestedCards: countNestedCards(previousEntity, config.childField),
      currentNestedCards: countNestedCards(currentEntity, config.childField)
    },
    metrics,
    composition: compareChildren(previousChildren, currentChildren),
    summaryEntries: collectStructureSummaryEntries(level, previousEntity, currentEntity)
  };
}

export function buildStructureVersionHistoryComparison({ entry } = {}) {
  return buildStructureVersionComparisonForVersion({
    entry,
    versionId: entry?.activeVersionId || ""
  });
}

export function buildStructureVersionComparisonForVersion({ entry, versionId = "" } = {}) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  if (versions.length <= 1 || !versionId) {
    return null;
  }

  const currentIndex = versions.findIndex((version) => version?.id === versionId);
  if (currentIndex <= 0) {
    return null;
  }

  const currentVersion = versions[currentIndex] || null;
  const parentVersion =
    versions.find((version) => version?.id === currentVersion?.parentVersionId) ||
    versions[currentIndex - 1] ||
    null;
  const previousVersion = parentVersion;
  if (!previousVersion?.snapshot || !currentVersion?.snapshot) {
    return null;
  }

  const details = buildStructureVersionComparison({
    level: entry.level,
    previousEntity: previousVersion.snapshot,
    currentEntity: currentVersion.snapshot
  });

  return {
    kind: "structure",
    previousVersion: {
      id: previousVersion.id || "",
      label: previousVersion.label || previousVersion.id || "Versão anterior",
      operationType: previousVersion.operationType || "",
      snapshot: previousVersion.snapshot
    },
    currentVersion: {
      id: currentVersion.id || "",
      label: currentVersion.label || currentVersion.id || "Versão atual",
      operationType: currentVersion.operationType || "",
      snapshot: currentVersion.snapshot
    },
    ...details
  };
}
