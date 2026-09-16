export function largeObservationContent(label = "Base anterior") {
  return { title: label, role: "theory", content: Array.from({ length: 70 }, (_, index) => ({
    id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
    data: { text: `${label} ${index}: ` + "Relação explicada. ".repeat(700).slice(0, 11900) }
  })), response: null, feedback: [], topics: [] };
}

export function largeObservationComparison({ courseId, annotationId, courseRevision = 4,
  annotationVersion = 2, targetSetVersion = 1, targetId = "unit-a" }) {
  const snapshot = (label, hash) => ({ hash: hash.repeat(64), content: largeObservationContent(label),
    sourceLinks: [], sources: [] });
  return { contract: "aralearn.course-observation-comparison.v1", courseId, courseRevision, annotationId,
    annotationVersion, targetSetVersion, target: { kind: "study_unit", id: targetId },
    basis: snapshot("Base anterior", "a"), current: snapshot("Base vigente", "b") };
}
