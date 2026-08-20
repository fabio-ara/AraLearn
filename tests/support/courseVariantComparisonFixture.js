const DEFAULT_SOURCE_COURSE_ID = "10000000-0000-4000-8000-000000000001";
const DEFAULT_COMPARISON_SET_ID = "81000000-0000-4000-8000-000000000008";
const DEFAULT_MEMBER_COURSE_ID = "82000000-0000-4000-8000-000000000009";
const CHECKPOINT_ID = "83000000-0000-4000-8000-000000000010";
const PART_ID = "84000000-0000-4000-8000-000000000011";

export function courseVariantComparisonFixture({
  sourceCourseId = DEFAULT_SOURCE_COURSE_ID,
  comparisonSetId = DEFAULT_COMPARISON_SET_ID,
  memberCourseId = DEFAULT_MEMBER_COURSE_ID,
  courseRevision = 7
} = {}) {
  const comparison = {
    contract: "aralearn.course-variant-comparison.v1",
    comparisonSetId,
    planning: {
      checkpointId: CHECKPOINT_ID,
      checkpointHash: "a".repeat(64),
      courseRevision,
      planVersion: 2,
      snapshot: { plan: { objective: "Planejamento comum" } }
    },
    source: {
      courseId: sourceCourseId,
      title: "Curso de origem",
      goal: "Objetivo comum",
      currentCourseRevision: courseRevision,
      checkpointCourseRevision: courseRevision,
      changedSinceCheckpoint: false,
      checkpointId: CHECKPOINT_ID,
      checkpointHash: "a".repeat(64)
    },
    members: [{
      courseId: memberCourseId,
      position: 0,
      label: "A",
      title: "Variante A",
      goal: "Objetivo A",
      attachedCourseRevision: 1,
      currentCourseRevision: 1,
      changedSinceAttached: false,
      parameterDifferences: [],
      componentPolicyDifference: null,
      effectiveParameters: [{
        scopeKind: "course",
        scopeId: "course",
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        value: 2,
        origin: "system_default",
        sourceScope: null
      }],
      effectiveComponentPolicies: [{
        scopeKind: "course",
        scopeId: "course",
        policy: {
          catalogVersion: "1",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        sourceScope: null
      }],
      componentsUsed: [],
      references: {
        sourceCount: 1,
        anchorCount: 1,
        pdfCount: 1,
        sharedPdfCount: 1,
        fingerprint: "b".repeat(64)
      },
      materialization: {
        plannedPartCount: 1,
        notStartedPartCount: 1,
        runningPartCount: 0,
        completedPartCount: 0,
        failedPartCount: 0,
        studyUnitCount: 0,
        latestUpdatedAt: null,
        partFingerprint: "c".repeat(64),
        studyUnitFingerprint: "d".repeat(64),
        parts: [{
          partId: PART_ID,
          position: 0,
          title: "Parte comum",
          intent: "Materializar de forma independente.",
          version: 1,
          status: "not_started",
          materializationId: null,
          materializationVersion: null,
          updatedAt: null,
          studyUnitCount: 0
        }],
        studyUnits: [],
        truncated: { parts: false, studyUnits: false }
      }
    }],
    differences: {
      referenceCourseId: memberCourseId,
      declared: [],
      observedExpected: [],
      accidentalDeviations: [],
      factual: [],
      missingData: []
    }
  };
  comparison.members.push({
    ...structuredClone(comparison.members[0]),
    courseId: "85000000-0000-4000-8000-000000000012",
    position: 1,
    label: "B",
    title: "Variante B",
    goal: "Objetivo B"
  });
  return comparison;
}
