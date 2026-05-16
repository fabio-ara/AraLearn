const COVERAGE_ROLE_STAGE = new Map([
  ["introduce", 0],
  ["explain", 1],
  ["demonstrate", 2],
  ["discriminate", 3],
  ["practice", 4],
  ["diagnose_error", 5],
  ["consolidate", 6],
  ["exam_apply", 7],
  ["integrate", 8]
]);

const DOMAIN_PRIORITY_STAGE = new Map([
  ["core", 0],
  ["support", 1],
  ["extension", 2]
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function list(value, limit = 8) {
  const seen = new Set();
  return normalizeArray(value)
    .map((item) => text(item))
    .filter((item) => {
      if (!item) {
        return false;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function buildDomainItemMap(lessonDomainMap = {}) {
  return new Map(
    normalizeArray(lessonDomainMap?.items)
      .map((item) => [text(item?.id), item])
      .filter(([id]) => id)
  );
}

function buildDomainDepthMap(lessonDomainMap = {}) {
  const domainItemMap = buildDomainItemMap(lessonDomainMap);
  const memo = new Map();
  const visiting = new Set();

  function resolveDepth(domainItemId) {
    const id = text(domainItemId);
    if (!id) {
      return 0;
    }
    if (memo.has(id)) {
      return memo.get(id);
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const item = domainItemMap.get(id);
    const prerequisites = list(item?.prerequisites, 12);
    const depth = prerequisites.length
      ? 1 + Math.max(...prerequisites.map((entry) => resolveDepth(entry)))
      : 0;
    visiting.delete(id);
    memo.set(id, depth);
    return depth;
  }

  domainItemMap.forEach((_value, key) => {
    resolveDepth(key);
  });

  return {
    domainItemMap,
    depthByDomainId: memo
  };
}

function getRoleStage(coverageRole = "") {
  return COVERAGE_ROLE_STAGE.has(text(coverageRole)) ? COVERAGE_ROLE_STAGE.get(text(coverageRole)) : 99;
}

function getPriorityStage(domainItemMap, domainRefs = []) {
  const priorities = domainRefs
    .map((domainRef) => text(domainItemMap.get(domainRef)?.priority))
    .filter(Boolean)
    .map((priority) => DOMAIN_PRIORITY_STAGE.get(priority) ?? 99);
  return priorities.length ? Math.min(...priorities) : 99;
}

function getDomainDepth(depthByDomainId, domainRefs = []) {
  const depths = domainRefs.map((domainRef) => depthByDomainId.get(domainRef)).filter((value) => Number.isFinite(value));
  return depths.length ? Math.max(...depths) : 0;
}

function buildNormalizedEntries({ microsequences = [], proposedOrderKeys = [], lessonDomainMap = {} } = {}) {
  const { domainItemMap, depthByDomainId } = buildDomainDepthMap(lessonDomainMap);
  const proposedMap = new Map(list(proposedOrderKeys, 256).map((key, index) => [key, index]));
  const currentOrderKeys = normalizeArray(microsequences)
    .map((item) => text(item?.key))
    .filter(Boolean);

  return normalizeArray(microsequences)
    .map((microsequence, index) => {
      const key = text(microsequence?.key);
      if (!key) {
        return null;
      }
      const domainRefs = list(microsequence?.domainRefs);
      return {
        key,
        title: text(microsequence?.title),
        primaryDomainRef: domainRefs[0] || "",
        domainRefs,
        hasDomainRefs: domainRefs.length > 0,
        domainDepth: getDomainDepth(depthByDomainId, domainRefs),
        roleStage: getRoleStage(microsequence?.coverageRole),
        priorityStage: getPriorityStage(domainItemMap, domainRefs),
        aiOrder: proposedMap.has(key) ? proposedMap.get(key) : currentOrderKeys.length + index,
        stableOrder: index
      };
    })
    .filter(Boolean);
}

function compareOrderingSignals(left, right) {
  const samePrimaryDomain = left.primaryDomainRef && left.primaryDomainRef === right.primaryDomainRef;

  if (left.hasDomainRefs && right.hasDomainRefs && left.domainDepth !== right.domainDepth) {
    return left.domainDepth - right.domainDepth;
  }

  if (samePrimaryDomain && left.roleStage !== right.roleStage) {
    return left.roleStage - right.roleStage;
  }

  if (left.hasDomainRefs && right.hasDomainRefs && left.priorityStage !== right.priorityStage) {
    return left.priorityStage - right.priorityStage;
  }

  if (left.aiOrder !== right.aiOrder) {
    return left.aiOrder - right.aiOrder;
  }

  if (left.stableOrder !== right.stableOrder) {
    return left.stableOrder - right.stableOrder;
  }

  return normalizeComparableText(left.title).localeCompare(normalizeComparableText(right.title));
}

export function resolveLessonMicrosequenceOrder({ microsequences = [], proposedOrderKeys = [], lessonDomainMap = {} } = {}) {
  const normalizedEntries = buildNormalizedEntries({
    microsequences,
    proposedOrderKeys,
    lessonDomainMap
  });

  return [...normalizedEntries].sort(compareOrderingSignals).map((entry) => entry.key);
}

export function sortLessonMicrosequencesDeterministically({ microsequences = [], proposedOrderKeys = [], lessonDomainMap = {} } = {}) {
  const keyOrder = resolveLessonMicrosequenceOrder({
    microsequences,
    proposedOrderKeys,
    lessonDomainMap
  });
  const byKey = new Map(
    normalizeArray(microsequences)
      .map((item) => [text(item?.key), item])
      .filter(([key]) => key)
  );
  return keyOrder.map((key) => byKey.get(key)).filter(Boolean);
}
