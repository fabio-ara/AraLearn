function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value = "") {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function collectVisibleTerms(cards = []) {
  return (Array.isArray(cards) ? cards : [])
    .flatMap((card) => JSON.stringify(card))
    .join(" ")
    .toLowerCase();
}

export function buildDependencyPacket({
  lesson = {},
  microsequence = {},
  dependencyMicrosequences = [],
  currentCards = []
} = {}) {
  return {
    lesson: structuredClone(lesson || {}),
    microsequence: structuredClone(microsequence || {}),
    dependencyMicrosequences: Array.isArray(dependencyMicrosequences) ? structuredClone(dependencyMicrosequences) : [],
    currentCards: Array.isArray(currentCards) ? structuredClone(currentCards) : []
  };
}

export function validateMicrosequenceDependencies(microsequence = {}, lesson = {}) {
  const items = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const currentIndex = items.findIndex((item) => item?.id === microsequence?.id);
  const errors = [];
  (Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn : []).forEach((dependencyId) => {
    const dependencyIndex = items.findIndex((item) => item?.id === dependencyId);
    if (dependencyIndex < 0) {
      errors.push(`dependsOn inexistente: ${dependencyId}.`);
    } else if (dependencyIndex >= currentIndex) {
      errors.push(`dependsOn futuro: ${dependencyId}.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

export function detectFutureConceptLeak(cards = [], dependencyPacket = {}) {
  const lessonItems = Array.isArray(dependencyPacket?.lesson?.microsequences) ? dependencyPacket.lesson.microsequences : [];
  const currentId = dependencyPacket?.microsequence?.id;
  const currentIndex = lessonItems.findIndex((item) => item?.id === currentId);
  const allowedLocalTerms = new Set(
    [
      dependencyPacket?.microsequence?.title,
      dependencyPacket?.microsequence?.goal,
      ...(Array.isArray(dependencyPacket?.microsequence?.covers) ? dependencyPacket.microsequence.covers : []),
      ...(Array.isArray(dependencyPacket?.microsequence?.checks) ? dependencyPacket.microsequence.checks : [])
    ]
      .map((item) => normalize(item))
      .filter(Boolean)
  );
  const futureConcepts = lessonItems
    .slice(currentIndex + 1)
    .flatMap((item) => [item?.title, item?.goal, ...(Array.isArray(item?.covers) ? item.covers : [])]);
  const source = collectVisibleTerms(cards);
  return futureConcepts
    .filter(Boolean)
    .filter((term) => {
      const normalizedTerm = normalize(term);
      if (allowedLocalTerms.has(normalizedTerm)) {
        return false;
      }
      return ![...allowedLocalTerms].some((localTerm) => normalizedTerm.includes(localTerm) || localTerm.includes(normalizedTerm));
    })
    .filter((term) => source.includes(normalize(term)));
}

export function validateCardPrerequisites(cards = [], dependencyPacket = {}) {
  const leaks = detectFutureConceptLeak(cards, dependencyPacket);
  return {
    ok: leaks.length === 0,
    errors: leaks.map((item) => `Conceito futuro detectado: ${item}.`)
  };
}

export function validateNextMicrosequenceUnlocked(lesson = {}, nextMicrosequence = {}) {
  const items = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const blockedBy = (Array.isArray(nextMicrosequence?.dependsOn) ? nextMicrosequence.dependsOn : []).find((dependencyId) => {
    const dependency = items.find((item) => item?.id === dependencyId);
    return !dependency || dependency.status === "planned";
  });
  return {
    ok: !blockedBy,
    blockedBy
  };
}
