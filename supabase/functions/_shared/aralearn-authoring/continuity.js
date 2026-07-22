import { sha256Hex } from "./security.js";

const STATE_DELTA_FIELDS = Object.freeze([
  "introducedTermIds",
  "usedClaimIds",
  "coveredOutcomeIds",
  "resolvedErrorIds",
  "notes"
]);

function requiredMode(status) {
  if (status === "repair_required") return "repair";
  if (status === "rebuild_required") return "rebuild";
  return "build";
}

function ledgerSlice(plan, specification, partKey) {
  const ledger = plan?.ledger && typeof plan.ledger === "object" ? plan.ledger : {};
  const cardPlan = Array.isArray(specification?.cardPlan) ? specification.cardPlan : [];
  const wantedCardIds = new Set([
    ...(Array.isArray(specification?.cardIds) ? specification.cardIds : []),
    ...cardPlan.map((card) => card?.cardId).filter(Boolean)
  ]);
  const wantedTermIds = new Set([
    ...(Array.isArray(specification?.availableTermIds) ? specification.availableTermIds : []),
    ...cardPlan.flatMap((card) => [
      ...(Array.isArray(card?.introducedTermIds) ? card.introducedTermIds : []),
      ...(Array.isArray(card?.requiredTermIds) ? card.requiredTermIds : [])
    ])
  ]);
  const allowedSourceIds = new Set([
    ...(Array.isArray(specification?.allowedSourceIds) ? specification.allowedSourceIds : []),
    ...cardPlan.flatMap((card) => Array.isArray(card?.sourceIds) ? card.sourceIds : [])
  ]);
  const terms = (Array.isArray(ledger.terms) ? ledger.terms : [])
    .filter((term) => wantedTermIds.has(term?.termId)
      || wantedCardIds.has(term?.firstTeachingCardId)
      || (Array.isArray(term?.requiredByCardIds)
        && term.requiredByCardIds.some((cardId) => wantedCardIds.has(cardId))));
  terms.forEach((term) => {
    for (const sourceId of Array.isArray(term?.sourceIds) ? term.sourceIds : []) {
      allowedSourceIds.add(sourceId);
    }
  });
  const claims = (Array.isArray(ledger.claims) ? ledger.claims : []).filter((claim) => {
    const allowedParts = Array.isArray(claim?.allowedPartKeys) ? claim.allowedPartKeys : [];
    const sourceIds = Array.isArray(claim?.sourceIds) ? claim.sourceIds : [];
    return allowedParts.includes(partKey)
      || sourceIds.some((sourceId) => allowedSourceIds.has(sourceId));
  });
  claims.forEach((claim) => {
    for (const sourceId of Array.isArray(claim?.sourceIds) ? claim.sourceIds : []) {
      allowedSourceIds.add(sourceId);
    }
  });
  const sources = (Array.isArray(ledger.sources) ? ledger.sources : [])
    .filter((source) => allowedSourceIds.has(source?.sourceId));
  return structuredClone({
    sources,
    claims,
    terms,
    openIssues: Array.isArray(ledger.openIssues) ? ledger.openIssues : []
  });
}

function projectSlice(project, ownership) {
  if (!project || typeof project !== "object" || !ownership) return null;
  const course = project.courses?.find((item) => item?.id === ownership.courseId);
  const moduleValue = course?.modules?.find((item) => item?.id === ownership.moduleId);
  const lesson = moduleValue?.lessons?.find((item) => item?.id === ownership.lessonId);
  if (!course || !moduleValue || !lesson) return null;
  return {
    ...structuredClone(project),
    courses: [{
      ...structuredClone(course),
      modules: [{
        ...structuredClone(moduleValue),
        lessons: [structuredClone(lesson)]
      }]
    }]
  };
}

export async function buildNextPart(run) {
  if (run?.nextAction === "upload_ledger"
      || run?.plan?.ledgerFinalized === false) {
    return {
      action: "upload_ledger",
      artifact: "aralearn.ledger-upload",
      version: 1,
      runId: run.runId,
      planHash: run.planHash,
      ledgerManifest: structuredClone(run?.plan?.ledgerManifest || null),
      ledgerProgress: structuredClone(run?.ledgerProgress || null)
    };
  }
  const next = run?.nextPart;
  if (!next) return null;
  if (!next.specification || typeof next.specification !== "object") {
    const outline = structuredClone(next.outline || {});
    const assignedOutcomes = new Set(
      Array.isArray(outline.outcomeIds) ? outline.outcomeIds : []
    );
    return {
      ...outline,
      action: "specify_part",
      artifact: "aralearn.part-outline",
      version: 1,
      runId: run.runId,
      partKey: next.partKey,
      position: next.position,
      planHash: run.planHash,
      brief: structuredClone(run.brief || {}),
      project: projectSlice(run?.plan?.project, outline.ownership),
      ledger: ledgerSlice(run?.plan, outline, next.partKey),
      learningOutcomes: structuredClone(
        (Array.isArray(run?.plan?.learningOutcomes) ? run.plan.learningOutcomes : [])
          .filter((outcome) => assignedOutcomes.has(outcome?.id))
      )
    };
  }
  const parts = Array.isArray(run?.parts) ? run.parts : [];
  const persistedContinuity = run?.continuity && typeof run.continuity === "object"
    ? run.continuity
    : {};
  const persistedStateDelta = persistedContinuity.stateDelta
    && typeof persistedContinuity.stateDelta === "object"
    ? persistedContinuity.stateDelta
    : {};
  const continuity = {
    approvedParts: structuredClone(
      Array.isArray(persistedContinuity.approvedParts)
        ? persistedContinuity.approvedParts
        : []
    ),
    stateDelta: Object.fromEntries(STATE_DELTA_FIELDS.map((field) => [
      field,
      structuredClone(
        Array.isArray(persistedStateDelta[field])
          ? persistedStateDelta[field]
          : []
      )
    ])),
    dependencyMicrosequenceIds: structuredClone(
      Array.isArray(persistedContinuity.dependencyMicrosequenceIds)
        ? persistedContinuity.dependencyMicrosequenceIds
        : []
    ),
    workedOperations: structuredClone(
      Array.isArray(persistedContinuity.workedOperations)
        ? persistedContinuity.workedOperations
        : []
    ),
    ...(typeof persistedContinuity.stateHash === "string"
      ? { stateHash: persistedContinuity.stateHash }
      : {})
  };
  const current = parts.find((part) => part?.partKey === next.partKey);
  const audits = Array.isArray(current?.audits) ? current.audits : [];
  const specification = next.specification && typeof next.specification === "object"
    ? structuredClone(next.specification)
    : {};
  for (const field of [
    "partKey", "artifact", "version", "runId", "position", "status",
    "mode", "attempt", "baseLedgerSha256", "continuity", "previousAudit"
  ]) delete specification[field];
  const ledger = ledgerSlice(run?.plan, specification, next.partKey);
  const assignedOutcomes = new Set(
    Array.isArray(specification.outcomeIds) ? specification.outcomeIds : []
  );
  const learningOutcomes = structuredClone(
    (Array.isArray(run?.plan?.learningOutcomes) ? run.plan.learningOutcomes : [])
      .filter((outcome) => assignedOutcomes.has(outcome?.id))
  );
  const specificationHash = next.specificationHash
    || await sha256Hex(JSON.stringify(specification));
  return {
    ...specification,
    action: "build_part",
    artifact: "aralearn.part-spec",
    version: 1,
    runId: run.runId,
    partKey: next.partKey,
    position: next.position,
    title: next.title,
    status: next.status,
    mode: requiredMode(next.status),
    attempt: Number(next.attempt || 0) + 1,
    baseLedgerSha256: await sha256Hex(JSON.stringify({
      planHash: run.planHash,
      specificationHash,
      ledger,
      learningOutcomes,
      continuity
    })),
    planHash: run.planHash,
    specificationHash,
    ledger,
    learningOutcomes,
    continuity,
    previousAudit: audits.length
      ? structuredClone(audits.at(-1))
      : structuredClone(current?.latestAudit || next?.latestAudit || null)
  };
}
