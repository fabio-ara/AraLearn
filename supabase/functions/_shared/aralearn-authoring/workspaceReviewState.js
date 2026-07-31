const CHILDREN = Object.freeze({
  course: ["module", "modules"],
  module: ["lesson", "lessons"],
  lesson: ["microsequence", "microsequences"],
  microsequence: ["card", "cards"]
});

export function invalidateReadyMicrosequence(microsequence) {
  if (microsequence?.status !== "ready") return false;
  microsequence.status = "needs_review";
  return true;
}

export function invalidateReadyDescendants(entityType, entity) {
  if (entityType === "microsequence") {
    return invalidateReadyMicrosequence(entity) ? 1 : 0;
  }
  const [childType, field] = CHILDREN[entityType] || [];
  if (!childType || !Array.isArray(entity?.[field])) return 0;
  return entity[field].reduce(
    (count, child) =>
      count + invalidateReadyDescendants(childType, child),
    0
  );
}
