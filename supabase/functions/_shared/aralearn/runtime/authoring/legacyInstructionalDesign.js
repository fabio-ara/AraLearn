import {
  InstructionalDesignValidationError,
  assertInstructionalDesignPersistenceSafety,
  deepFreezeInstructionalDesignValue,
  normalizeEffectiveDesignSnapshot,
  normalizeInstructionalAnalysis,
  normalizeMaterializationManifest
} from "./instructionalDesignValidation.js";

export const LEGACY_INSTRUCTIONAL_DESIGN_STATUS = Object.freeze({
  unresolved: "unresolved",
  legacyUntracked: "legacy_untracked",
  legacyUnrestricted: "legacy_unrestricted"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function invalidLegacy(path, message) {
  throw new InstructionalDesignValidationError("legacyProjection", [{
    path,
    message,
    code: "invalid_legacy_projection"
  }]);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableValue(value[key])}`
    )).join(",")}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function versionedRefKey(value) {
  return stableValue([text(value?.id), text(value?.version)]);
}

function scopeKey(value) {
  return stableValue([text(value?.kind), text(value?.ref)]);
}

function validateOfflineArtifactContinuity(analysis, snapshot, manifest) {
  if (snapshot && !analysis) {
    invalidLegacy("$.effectiveSnapshot", "Snapshot offline exige a análise correspondente.");
  }
  if (manifest && (!analysis || !snapshot)) {
    invalidLegacy("$.materializationManifest", "Manifesto offline exige análise e snapshot correspondentes.");
  }
  if (analysis && snapshot && (
    versionedRefKey(snapshot.analysisRef) !== versionedRefKey(analysis)
      || scopeKey(snapshot.scope) !== scopeKey(analysis.scope)
      || snapshot.scopeEntityVersion !== analysis.derivedFrom.scopeEntityVersion
      || snapshot.basedOnWorkspaceRevision < analysis.derivedFrom.workspaceRevision
  )) {
    invalidLegacy("$.effectiveSnapshot", "Snapshot offline está stale ou pertence a outra análise.");
  }
  if (manifest && (
    versionedRefKey(manifest.analysisRef) !== versionedRefKey(analysis)
      || versionedRefKey(manifest.effectiveSnapshotRef) !== versionedRefKey(snapshot)
      || scopeKey(manifest.scope) !== scopeKey(snapshot.scope)
      || manifest.scopeEntityVersion !== snapshot.scopeEntityVersion
      || manifest.materializedWorkspaceRevision < snapshot.basedOnWorkspaceRevision
      || stableValue(manifest.resourceSetRefs) !== stableValue(snapshot.resourceSetRefs)
  )) {
    invalidLegacy("$.materializationManifest", "Manifesto offline está stale ou pertence a outro desenho.");
  }
}

export function projectLegacyInstructionalDesignState({
  workspaceRef,
  scope,
  blueprintRef = null,
  hasMaterializedContent = false
} = {}) {
  assertInstructionalDesignPersistenceSafety({
    workspaceRef,
    scope,
    blueprintRef,
    hasMaterializedContent
  });
  if (!text(workspaceRef)) invalidLegacy("$.workspaceRef", "Workspace precisa de referência explícita.");
  if (!exactKeys(scope, ["kind", "ref"])
    || !["workspace", "course", "module", "lesson", "microsequence"].includes(scope.kind)
    || !text(scope.ref)) {
    invalidLegacy("$.scope", "Escopo legado é inválido.");
  }
  if (blueprintRef !== null && (
    !exactKeys(blueprintRef, ["id", "version"])
      || !text(blueprintRef.id)
      || !text(blueprintRef.version)
  )) {
    invalidLegacy("$.blueprintRef", "Referência de blueprint é inválida.");
  }
  if (typeof hasMaterializedContent !== "boolean") {
    invalidLegacy("$.hasMaterializedContent", "Presença de conteúdo precisa ser booleana.");
  }
  return deepFreezeInstructionalDesignValue({
    contract: "LegacyInstructionalDesignProjection@1",
    workspaceRef: text(workspaceRef),
    scope: structuredClone(scope),
    analysis: {
      status: LEGACY_INSTRUCTIONAL_DESIGN_STATUS.unresolved,
      analysisRef: null,
      reason: "legacy_workspace_without_instructional_analysis"
    },
    parameters: {
      status: LEGACY_INSTRUCTIONAL_DESIGN_STATUS.unresolved,
      effectiveSnapshotRef: null,
      resolvedValues: []
    },
    resources: {
      status: hasMaterializedContent
        ? LEGACY_INSTRUCTIONAL_DESIGN_STATUS.legacyUnrestricted
        : LEGACY_INSTRUCTIONAL_DESIGN_STATUS.unresolved,
      resourceSetRefs: [],
      reason: hasMaterializedContent
        ? "legacy_content_without_explicit_resource_sets"
        : "workspace_without_materialized_content"
    },
    materialization: {
      status: hasMaterializedContent
        ? LEGACY_INSTRUCTIONAL_DESIGN_STATUS.legacyUntracked
        : LEGACY_INSTRUCTIONAL_DESIGN_STATUS.unresolved,
      manifestRef: null,
      blueprintRef: blueprintRef ? structuredClone(blueprintRef) : null
    }
  });
}

export function projectOfflineInstructionalDesignState({
  analysis: rawAnalysis = null,
  effectiveSnapshot: rawSnapshot = null,
  materializationManifest: rawManifest = null,
  legacyProjection = null,
  mayQueueManualOverride = false
} = {}) {
  const analysis = rawAnalysis ? normalizeInstructionalAnalysis(rawAnalysis) : null;
  const snapshot = rawSnapshot ? normalizeEffectiveDesignSnapshot(rawSnapshot) : null;
  const manifest = rawManifest ? normalizeMaterializationManifest(rawManifest) : null;
  validateOfflineArtifactContinuity(analysis, snapshot, manifest);
  let canonicalLegacyProjection = null;
  if (legacyProjection) {
    assertInstructionalDesignPersistenceSafety(legacyProjection);
    canonicalLegacyProjection = projectLegacyInstructionalDesignState({
      workspaceRef: legacyProjection.workspaceRef,
      scope: legacyProjection.scope,
      blueprintRef: legacyProjection.materialization?.blueprintRef ?? null,
      hasMaterializedContent: (
        legacyProjection.materialization?.status
          === LEGACY_INSTRUCTIONAL_DESIGN_STATUS.legacyUntracked
      )
    });
    if (stableValue(canonicalLegacyProjection) !== stableValue(legacyProjection)) {
      invalidLegacy("$", "Projeção legada diverge da forma canônica.");
    }
  }
  const state = canonicalLegacyProjection
    ? structuredClone(canonicalLegacyProjection)
    : {
        contract: "OfflineInstructionalDesignProjection@1",
        analysis,
        effectiveSnapshot: snapshot,
        materializationManifest: manifest
      };
  state.offlineAuthority = {
    source: "synced_replica",
    canRead: true,
    canQueueManualOverride: mayQueueManualOverride === true,
    canGrantResearchAuthority: false,
    canChangeResearchLock: false,
    mustRevalidateLocksAndPermissionsRemotely: true
  };
  return deepFreezeInstructionalDesignValue(state);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function measureInstructionalDesignPayload(recordGroups = {}) {
  assertInstructionalDesignPersistenceSafety(recordGroups);
  const byKind = {};
  let totalBytes = 0;
  let totalRecords = 0;
  let maxRecordBytes = 0;
  Object.entries(recordGroups).sort(([left], [right]) => left.localeCompare(right, "en"))
    .forEach(([kind, records]) => {
      const sizes = list(records).map(byteLength);
      const bytes = sizes.reduce((sum, size) => sum + size, 0);
      totalBytes += bytes;
      totalRecords += sizes.length;
      maxRecordBytes = Math.max(maxRecordBytes, ...sizes, 0);
      byKind[kind] = {
        count: sizes.length,
        bytes,
        maxRecordBytes: Math.max(...sizes, 0)
      };
    });
  return deepFreezeInstructionalDesignValue({
    contract: "InstructionalDesignPayloadMeasurement@1",
    encoding: "utf-8-json",
    totalRecords,
    totalBytes,
    averageRecordBytes: totalRecords ? Math.ceil(totalBytes / totalRecords) : 0,
    maxRecordBytes,
    byKind
  });
}
