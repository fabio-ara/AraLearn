const ACTIVE_FINDING_STATUSES = new Set(["open", "approved", "repaired"]);

const STATE_LABELS = Object.freeze({
  planning: "Em planejamento",
  building: "Em construção",
  audit_pending: "Revisão pendente",
  ready: "Sem pendência",
  missing: "Indisponível"
});

const MICRO_STATE_LABELS = Object.freeze({
  planned: "Planejada",
  analyzed: "Analisada",
  materialized: "Com conteúdo",
  audit_pending: "Com achado pendente",
  ready: "Pronta",
  missing: "Indisponível"
});

const ENUM_LABELS = Object.freeze({
  block: "Bloquear",
  allow_versatile_with_limitation: "Permitir opção versátil, registrando a limitação",
  allow_substitute_with_limitation: "Permitir substituta, registrando a limitação"
});

const UNIT_LABELS = Object.freeze({
  "assumed_new_analysis_unit/theory_step": "unidades novas / passo",
  "assumed_new_analysis_unit/coordination_set": "unidades novas / relação",
  "explanation_requirement_ref/microsequence": "requisitos / microssequência",
  "evidence_alignment_edge/microsequence": "relações / microssequência",
  "distinct_semantic_practice_opportunity/evidence_requirement": "oportunidades / requisito",
  "variation_dimension/evidence_requirement": "dimensões / requisito",
  "accepted_performance_form/evidence_requirement": "formas / requisito",
  "fallback_policy_category/resource_selection": "política de representação",
  "resource_set_ref/scope": "conjuntos disponíveis"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function refKey(value) {
  return `${text(value?.id)}\u0000${text(value?.version)}`;
}

function sameRef(left, right) {
  return Boolean(text(left?.id)) && refKey(left) === refKey(right);
}

function titleFromIdentifier(value) {
  return text(value)
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function enumLabel(value) {
  return ENUM_LABELS[text(value)] || titleFromIdentifier(value);
}

function unitLabel(unit) {
  const numerator = text(unit?.numerator);
  const denominator = text(unit?.denominator);
  return UNIT_LABELS[`${numerator}/${denominator}`] || "";
}

function optionalRef(value) {
  const id = text(value?.id);
  const version = text(value?.version);
  return id ? { id, ...(version ? { version } : {}) } : null;
}

function optionalRuleRef(value) {
  const id = text(value?.id);
  const kind = text(value?.kind);
  if (!id || !kind) return null;
  return {
    kind,
    id,
    version: value?.version == null ? null : text(value.version) || null
  };
}

function optionalArtifactRefs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [key, reference] of Object.entries(value)) {
    if (reference && typeof reference === "object" && !Array.isArray(reference) &&
        Array.isArray(reference.items)) {
      const items = reference.items.flatMap((item) => {
        const normalized = optionalRef(item);
        if (normalized) return [normalized];
        const identifier = text(item);
        return identifier ? [identifier] : [];
      });
      const rawCount = Number(reference.count);
      const count = Number.isSafeInteger(rawCount) && rawCount >= 0
        ? Math.max(rawCount, items.length)
        : items.length;
      if (items.length || count) {
        result[key] = {
          items,
          count,
          truncated: reference.truncated === true || count > items.length
        };
      }
      continue;
    }
    if (Array.isArray(reference)) {
      const refs = reference.map(optionalRef).filter(Boolean);
      if (refs.length) result[key] = refs;
      continue;
    }
    const normalized = optionalRef(reference);
    if (normalized) result[key] = normalized;
  }
  return Object.keys(result).length ? result : null;
}

function parameterValueLabel(value, definition = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Ainda não resolvido";
  if (value.kind === "integer" || value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return value.value === true ? "Sim" : "Não";
  if (value.kind === "enum") return enumLabel(value.value);
  if (value.kind === "range") return `${value.minimum}–${value.maximum}`;
  if (value.kind === "set") {
    const count = list(value.values).length;
    if (definition.id === "available_resource_set_refs") {
      return count ? `${count} ${count === 1 ? "conjunto" : "conjuntos"}` : "Catálogo completo";
    }
    return `${count} ${count === 1 ? "item" : "itens"}`;
  }
  if (value.kind === "vector") {
    const count = list(value.components).length;
    return `${count} ${count === 1 ? "dimensão" : "dimensões"}`;
  }
  if (value.kind === "relation") {
    const count = list(value.edges).length;
    return `${count} ${count === 1 ? "relação" : "relações"}`;
  }
  return "Valor estruturado";
}

function parameterControl(definition) {
  const constraints = definition?.constraints || {};
  if (definition?.valueType === "integer") {
    return {
      kind: "integer",
      ...(Number.isFinite(constraints.minimum) ? { min: constraints.minimum } : {}),
      ...(Number.isFinite(constraints.maximum) ? { max: constraints.maximum } : {}),
      step: 1
    };
  }
  if (definition?.valueType === "enum") {
    return {
      kind: "enum",
      options: list(constraints.allowedEnumValues).map((value) => ({
        value,
        label: enumLabel(value)
      }))
    };
  }
  return { kind: "readonly" };
}

function flattenMicrosequences(outline) {
  return list(outline?.content?.courses || outline?.courses).flatMap((course) =>
    list(course?.modules).flatMap((moduleValue) =>
      list(moduleValue?.lessons).flatMap((lesson) =>
        list(lesson?.microsequences).map((microsequence) => ({
          id: text(microsequence?.id),
          title: text(microsequence?.title) || "Microssequência",
          entityPath: list(microsequence?.entityPath).length === 4
            ? structuredClone(microsequence.entityPath)
            : [course?.id, moduleValue?.id, lesson?.id, microsequence?.id].map(text),
          cardCount: Number.isSafeInteger(Number(microsequence?.cardCount))
            ? Number(microsequence.cardCount)
            : 0
        }))
      )
    )
  ).filter(({ id, entityPath }) => id && entityPath.every(Boolean));
}

function aggregateState(states) {
  if (states.some((state) => ["audit_pending", "missing"].includes(state))) {
    return "audit_pending";
  }
  if (states.some((state) => ["building", "analyzed", "materialized"].includes(state))) {
    return "building";
  }
  if (states.length && states.every((state) => state === "ready")) return "ready";
  return "planning";
}

function aggregateMicrosequenceState(states) {
  if (states.includes("missing")) return "missing";
  if (states.includes("audit_pending")) return "audit_pending";
  if (states.length && states.every((state) => state === "ready")) return "ready";
  if (states.some((state) => ["materialized", "ready"].includes(state))) return "materialized";
  if (states.includes("analyzed")) return "analyzed";
  return "planned";
}

function projectedFinding(workspaceId, finding) {
  const findingId = text(finding?.observationId || finding?.findingId || finding?.id);
  const code = text(finding?.code || finding?.findingCode || finding?.category);
  const target = finding?.target && typeof finding.target === "object" ? finding.target : {};
  const currentPath = list(finding?.currentEntityPath || target?.currentEntityPath);
  const originalPath = list(finding?.entityPath || target?.entityPath);
  const targetAvailable = finding?.targetAvailable !== false;
  const entityPath = targetAvailable
    ? (currentPath.length ? currentPath : originalPath)
    : [];
  const readerTarget = targetAvailable && entityPath.length
    ? {
        workspaceId,
        entityPath: structuredClone(entityPath),
        ...(text(finding?.resourceTargetId || target?.resourceTargetId)
          ? { resourceTargetId: text(finding?.resourceTargetId || target?.resourceTargetId) }
          : {})
      }
    : null;
  const origin = text(finding?.origin || finding?.findingOrigin);
  const auditRunRef = optionalRef(finding?.auditRunRef);
  const verificationAuditRunRef = optionalRef(finding?.verificationAuditRunRef);
  const ruleRef = optionalRuleRef(finding?.ruleRef);
  const artifactRefs = optionalArtifactRefs(finding?.artifactRefs);
  const structuredAudit = Boolean(
    auditRunRef || verificationAuditRunRef || ruleRef || artifactRefs ||
    ["deterministic", "semantic_audit"].includes(origin) ||
    text(finding?.code || finding?.findingCode) || text(finding?.publicEvidence) ||
    text(finding?.auditPartId)
  );
  return {
    findingId,
    summary: text(finding?.summary || finding?.body) || titleFromIdentifier(code) || "Achado de revisão",
    code,
    category: text(finding?.category),
    origin: ["deterministic", "semantic_audit"].includes(origin) ? origin : "legacy",
    ruleRef,
    publicEvidence: text(finding?.publicEvidence || finding?.evidence || finding?.body),
    severity: text(finding?.severity) || "medium",
    status: text(finding?.status) || "open",
    proposedRepair: text(finding?.proposedRepair) || null,
    auditRunRef,
    verificationAuditRunRef,
    artifactRefs,
    legacyCompatible: !structuredAudit,
    auditRevision: Number.isSafeInteger(Number(finding?.auditRevision ?? finding?.detectedRevision))
      ? Number(finding.auditRevision ?? finding.detectedRevision)
      : null,
    resultingRevision: Number.isSafeInteger(Number(finding?.resultingRevision))
      ? Number(finding.resultingRevision)
      : null,
    verification: text(finding?.verification) || null,
    auditPartId: text(finding?.auditPartId) || null,
    entityType: text(finding?.entityType || target?.entityType),
    entityPath: structuredClone(entityPath),
    ...(originalPath.length ? { originalEntityPath: structuredClone(originalPath) } : {}),
    targetAvailable,
    readerTarget,
    returnContext: {
      surface: "audit",
      workspaceId,
      findingId
    }
  };
}

export function projectAuthoringFinding(workspaceId, finding) {
  return projectedFinding(text(workspaceId).toLowerCase(), finding);
}

const AUDIT_DIMENSIONS = Object.freeze([
  "structure", "design", "practice", "resources",
  "coverage", "coherence", "dependencies", "redundancy", "integration"
]);

function projectedAuditSummary(value) {
  const source = value?.dimensions && typeof value.dimensions === "object"
    ? value.dimensions
    : value && typeof value === "object" ? value : {};
  const dimensions = {};
  for (const key of AUDIT_DIMENSIONS) {
    const entry = source[key];
    const explicit = typeof entry === "string" ? entry : text(entry?.status);
    const status = ["conformant", "finding", "not_checked"].includes(explicit)
      ? explicit
      : "not_checked";
    dimensions[key] = {
      status,
      findingCount: Math.max(0, Number(entry?.findingCount) || 0)
    };
  }
  return {
    dimensions,
    findingCount: Math.max(
      0,
      Number(value?.findingCount ?? value?.deterministicFindingCount) || 0
    )
  };
}

function projectedAuditComponents(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const items = list(source.items).flatMap((item) => {
    const microsequenceRef = text(item?.microsequenceRef);
    const microsequencePath = list(item?.microsequencePath).map(text);
    if (!microsequenceRef) return [];
    return [{
      ordinal: Number.isSafeInteger(Number(item?.ordinal)) ? Number(item.ordinal) : null,
      microsequenceRef,
      microsequencePath: microsequencePath.length === 4 && microsequencePath.every(Boolean)
        ? microsequencePath
        : null,
      childAuditRunRef: optionalRef(item?.childAuditRunRef),
      auditedRevision: Number.isSafeInteger(Number(item?.auditedRevision))
        ? Number(item.auditedRevision)
        : null,
      contentHash: text(item?.contentHash) || null,
      status: item?.status === "complete" ? "complete" : "not_audited",
      targetAvailable: item?.targetAvailable === true
    }];
  });
  return {
    items,
    count: Math.max(items.length, Math.max(0, Number(source.count) || 0)),
    nextCursor: source.nextCursor == null ? null : text(source.nextCursor) || null,
    truncated: source.truncated === true
  };
}

export function projectAuthoringAuditSlice({ workspaceId, response, stale = false } = {}) {
  const workspace = text(workspaceId || response?.workspaceId).toLowerCase();
  const result = response?.result || response || {};
  const audit = result?.audit || result;
  const latest = audit?.latestAuditRun || null;
  const scope = latest?.scope && typeof latest.scope === "object"
    ? { kind: text(latest.scope.kind), ref: text(latest.scope.ref) }
    : null;
  return {
    workspaceId: workspace,
    revision: Number.isSafeInteger(Number(response?.revision ?? result?.revision))
      ? Number(response?.revision ?? result?.revision)
      : 0,
    stale: stale === true,
    latestAuditRun: latest ? {
      ref: optionalRef(latest.ref),
      kind: text(latest.kind),
      status: text(latest.status) || "pending",
      current: latest.current === true,
      scope,
      startedRevision: Number.isSafeInteger(Number(latest.startedRevision))
        ? Number(latest.startedRevision)
        : null,
      completedRevision: Number.isSafeInteger(Number(latest.completedRevision))
        ? Number(latest.completedRevision)
        : null,
      createdAt: text(latest.createdAt) || null,
      completedAt: text(latest.completedAt) || null
    } : null,
    summary: projectedAuditSummary(audit?.summary),
    components: projectedAuditComponents(audit?.components),
    findings: list(audit?.findings).map((finding) => projectedFinding(workspace, {
      ...finding,
      ...(scope?.kind === "part" && !text(finding?.auditPartId)
        ? { auditPartId: scope.ref }
        : {})
    })),
    total: Math.max(0, Number(audit?.total) || 0),
    nextCursor: audit?.nextCursor == null ? null : structuredClone(audit.nextCursor),
    truncated: audit?.truncated === true,
    coordination: result?.coordination && typeof result.coordination === "object"
      ? structuredClone(result.coordination)
      : null,
    capabilities: result?.capabilities && typeof result.capabilities === "object"
      ? structuredClone(result.capabilities)
      : null
  };
}

export function authoringStateLabel(state) {
  return STATE_LABELS[state] || STATE_LABELS.planning;
}

export function projectAuthoringWorkspaceListItem(item, {
  cachedOverview = null,
  pendingCount = 0,
  hasConflict = false
} = {}) {
  let state = text(item?.authoringState?.state || item?.authoringState || cachedOverview?.state);
  if (!Object.hasOwn(STATE_LABELS, state)) {
    state = "planning";
  }
  const conflictCount = hasConflict === true ? 1 : 0;
  const normalizedPendingCount = Math.max(0, Number(pendingCount) || 0);
  return {
    workspaceId: text(item?.workspaceId),
    title: text(item?.title) || "Workspace",
    state,
    stateLabel: authoringStateLabel(state),
    ...(text(item?.courseKey) ? { courseKey: text(item.courseKey) } : {}),
    pending: !hasConflict && normalizedPendingCount > 0,
    pendingCount: hasConflict ? 0 : normalizedPendingCount,
    conflict: hasConflict === true,
    conflictCount,
    capabilities: {
      design: ["owner", "admin", "author"].includes(text(item?.role)),
      audit: ["owner", "admin", "author", "reviewer"].includes(text(item?.role)),
      editContent: ["owner", "admin", "author"].includes(text(item?.role))
    }
  };
}

export function projectAuthoringWorkspaceOverview({
  outline,
  resume,
  access = null,
  pendingOperations = [],
  stale = false
}) {
  const workspaceId = text(outline?.workspaceId || resume?.workspaceId);
  const revision = Number(outline?.revision);
  const microsequences = flattenMicrosequences(outline);
  const microsequenceById = new Map(microsequences.map((item) => [item.id, item]));
  // `microsequenceStateMap` pertence ao mesmo snapshot do resume e é a
  // autoridade compacta do Mapa. Fatias locais existem para leitura offline do
  // Desenho, não para inferir andamento pedagógico.
  const canonicalStateMap = resume?.content?.unassignedMicrosequenceStateMap
    || resume?.content?.microsequenceStateMap
    || {};
  const activeFindings = list(resume?.content?.findings?.items)
    .filter((finding) => ACTIVE_FINDING_STATUSES.has(text(finding?.status)))
    .map((finding) => projectedFinding(workspaceId, finding));
  const findingSummary = resume?.content?.findings?.summary || {};
  const findingsTotal = Math.max(
    activeFindings.length,
    Number.isSafeInteger(Number(findingSummary?.activeCount))
      ? Number(findingSummary.activeCount)
      : 0
  );
  const findingCountByMicrosequence = new Map();
  activeFindings.forEach((finding) => {
    const microsequenceId = text(finding.entityPath?.[3]);
    if (microsequenceId) {
      findingCountByMicrosequence.set(
        microsequenceId,
        (findingCountByMicrosequence.get(microsequenceId) || 0) + 1
      );
    }
  });
  const pendingByMicrosequence = new Map();
  list(pendingOperations).forEach((operation) => {
    const microsequenceId = text(operation?.microsequenceRef);
    if (!microsequenceId) return;
    const values = pendingByMicrosequence.get(microsequenceId) || [];
    values.push(operation);
    pendingByMicrosequence.set(microsequenceId, values);
  });
  const assigned = new Set();
  const parts = list(resume?.content?.parts).map((part, partIndex) => {
    const mask = text(part?.microsequenceStateMask);
    const partMicrosequences = list(part?.microsequenceIds).map((microsequenceId, index) => {
      const microsequence = microsequenceById.get(text(microsequenceId));
      if (!microsequence) {
        return {
          title: `Unidade indisponível ${index + 1}`,
          entityPath: null,
          state: "missing",
          stateLabel: MICRO_STATE_LABELS.missing,
          analyzed: false,
          materialized: false,
          findingCount: 0,
          pending: false,
          conflict: false,
          targetAvailable: false
        };
      }
      assigned.add(microsequence.id);
      const marker = mask[index] || text(canonicalStateMap[microsequence.id])
        || (microsequence.cardCount > 0 ? "m" : "p");
      const findingCount = findingCountByMicrosequence.get(microsequence.id) || 0;
      const pending = pendingByMicrosequence.get(microsequence.id) || [];
      const state = findingCount
        ? "audit_pending"
        : marker === "f"
          ? "audit_pending"
        : marker === "r"
          ? "ready"
          : marker === "m"
            ? "materialized"
            : marker === "a"
              ? "analyzed"
              : "planned";
      const conflicts = pending.filter((operation) => operation?.status === "conflict");
      const queued = pending.filter((operation) => operation?.status === "pending");
      return {
        title: microsequence.title,
        entityPath: structuredClone(microsequence.entityPath),
        state,
        stateLabel: MICRO_STATE_LABELS[state],
        analyzed: marker === "a",
        materialized: marker === "m" || marker === "r",
        findingCount,
        pending: conflicts.length === 0 && queued.length > 0,
        pendingCount: conflicts.length === 0 ? queued.length : 0,
        conflict: conflicts.length > 0,
        conflictCount: conflicts.length
      };
    });
    const state = aggregateMicrosequenceState(partMicrosequences.map((item) => item.state));
    return {
      partId: text(part?.id),
      title: text(part?.title) || `Parte ${partIndex + 1}`,
      state,
      stateLabel: MICRO_STATE_LABELS[state],
      microsequences: partMicrosequences
    };
  });
  const unassigned = microsequences.filter(({ id }) => !assigned.has(id)).map((microsequence) => {
    const findingCount = findingCountByMicrosequence.get(microsequence.id) || 0;
    const pending = pendingByMicrosequence.get(microsequence.id) || [];
    const marker = text(canonicalStateMap[microsequence.id])
      || (microsequence.cardCount > 0 ? "m" : "p");
    const state = findingCount
      ? "audit_pending"
      : marker === "f"
        ? "audit_pending"
      : marker === "r"
        ? "ready"
      : marker === "m"
        ? "materialized"
        : marker === "a" ? "analyzed" : "planned";
    const conflicts = pending.filter((operation) => operation?.status === "conflict");
    const queued = pending.filter((operation) => operation?.status === "pending");
    return {
      title: microsequence.title,
      entityPath: structuredClone(microsequence.entityPath),
      state,
      stateLabel: MICRO_STATE_LABELS[state],
      analyzed: marker === "a",
      materialized: marker === "m" || marker === "r",
      findingCount,
      pending: conflicts.length === 0 && queued.length > 0,
      pendingCount: conflicts.length === 0 ? queued.length : 0,
      conflict: conflicts.length > 0,
      conflictCount: conflicts.length
    };
  });
  if (unassigned.length) {
    const state = aggregateMicrosequenceState(unassigned.map((item) => item.state));
    parts.push({
      partId: null,
      title: "Ainda sem Parte",
      state,
      stateLabel: MICRO_STATE_LABELS[state],
      microsequences: unassigned
    });
  }
  const capabilities = access?.capabilities || outline?.capabilities || {};
  const canAuthor = capabilities.author === true || capabilities.manage === true;
  const conflictOperations = pendingOperations.filter((operation) => operation?.status === "conflict");
  const queuedOperations = pendingOperations.filter((operation) => operation?.status === "pending");
  const state = findingsTotal > 0
    ? "audit_pending"
    : aggregateState(parts.map((part) => part.state));
  return {
    workspaceId,
    title: text(outline?.title || resume?.title) || "Workspace",
    revision,
    stale: stale === true,
    pending: conflictOperations.length === 0 && queuedOperations.length > 0,
    pendingCount: conflictOperations.length === 0 ? queuedOperations.length : 0,
    conflict: conflictOperations.length > 0,
    conflictCount: conflictOperations.length,
    state,
    stateLabel: authoringStateLabel(state),
    parts,
    findings: activeFindings,
    findingsTotal,
    findingsActiveCount: findingsTotal,
    findingsTruncated: resume?.content?.findings?.truncated === true,
    findingsNextCursor: resume?.content?.findings?.nextCursor == null
      ? null
      : structuredClone(resume.content.findings.nextCursor),
    mandate: resume?.content?.mandate && typeof resume.content.mandate === "object"
      ? structuredClone(resume.content.mandate)
      : null,
    capabilities: {
      design: canAuthor,
      audit: capabilities.review === true || capabilities.manage === true,
      editContent: canAuthor,
      decideFindings: canAuthor,
      prepareRepairs: canAuthor,
      requestAudit: canAuthor
    }
  };
}

export function projectAuthoringDesignSlice({
  slice,
  pendingOperations = [],
  capability = "read",
  stale = false
}) {
  const result = slice?.result || slice?.state || {};
  const definitions = list(result?.parameterDefinitions?.relevant);
  const assignments = list(result?.assignments);
  const locks = list(result?.locks);
  const resolvedValues = list(result?.effectiveSnapshot?.resolvedValues);
  const canOverride = new Set(["author", "manage"]).has(capability);
  const parameters = definitions.map((definition) => {
    const definitionRef = { id: text(definition?.id), version: text(definition?.version) };
    const resolved = resolvedValues.find((entry) => sameRef(entry?.definitionRef, definitionRef));
    const lockedAssignment = locks.find((entry) => sameRef(entry?.definitionRef, definitionRef));
    const matchingOperations = list(pendingOperations).filter((entry) => (
      sameRef(entry?.definitionRef, definitionRef)
    ));
    const pending = matchingOperations.find((entry) => entry?.status === "conflict")
      || matchingOperations.find((entry) => entry?.status === "pending")
      || null;
    const conflicted = pending?.status === "conflict";
    const locked = Boolean(lockedAssignment)
      || resolved?.resolution?.assignmentMode === "research_lock";
    const inheritance = text(resolved?.resolution?.inheritance);
    const assignmentMode = text(resolved?.resolution?.assignmentMode);
    const origin = locked
      ? "research_locked"
      : inheritance === "inherited"
        ? "inherited"
        : assignmentMode === "manual_override"
          ? "manual"
          : "auto";
    const control = parameterControl(definition);
    const localAssignment = assignments.find((entry) => (
      sameRef(entry?.definitionRef, definitionRef)
      && entry?.scope?.kind === "microsequence"
      && entry?.mode === "manual_override"
    ));
    return {
      parameterKey: definitionRef.id,
      key: definitionRef.id,
      definitionRef,
      label: text(definition?.label) || "Parâmetro",
      value: resolved?.value == null ? null : structuredClone(resolved.value),
      valueLabel: parameterValueLabel(resolved?.value, definition),
      valueText: parameterValueLabel(resolved?.value, definition),
      origin,
      source: origin,
      originLabel: origin === "research_locked"
        ? "Bloqueado por pesquisa"
        : origin === "inherited"
          ? "Herdado"
          : origin === "manual" ? "Definido pelo autor" : "Auto",
      locked,
      editable: canOverride && !locked && control.kind !== "readonly",
      control,
      unitLabel: unitLabel(definition?.unit),
      pending: !conflicted && pending?.status === "pending",
      conflict: conflicted,
      pendingAction: pending?.action || "",
      pendingStatus: pending?.status || "",
      pendingRequestId: text(pending?.requestId),
      pendingValue: pending?.assignment?.value == null
        ? null
        : structuredClone(pending.assignment.value),
      conflictMessage: text(pending?.errorMessage),
      assignmentRef: localAssignment
        ? { id: text(localAssignment.id), version: text(localAssignment.version) }
        : null
    };
  });
  const resourceSets = list(result?.effectiveResourceSets);
  const resourceParameter = parameters.find((entry) => (
    entry.parameterKey === "available_resource_set_refs"
  ));
  const packageCount = resourceSets.reduce((total, set) => (
    total + (Number.isSafeInteger(Number(set?.packageCount)) ? Number(set.packageCount) : 0)
  ), 0);
  const resources = resourceSets.length
    ? {
        summary: resourceSets.length === 1
          ? `Conjunto atual · ${packageCount} ${packageCount === 1 ? "Resource" : "Resources"}`
          : `${resourceSets.length} conjuntos · ${packageCount} Resources`,
        setRef: resourceSets.length === 1 ? structuredClone(resourceSets[0].ref) : null,
        setCount: resourceSets.length,
        packageCount,
        editable: canOverride && resourceParameter?.locked !== true && stale !== true,
        sets: resourceSets.map((set) => ({
          ref: structuredClone(set.ref),
          scope: structuredClone(set.scope),
          packageCount: Number(set.packageCount) || 0,
          resolvedCatalogVersion: text(set.resolvedCatalogVersion)
        }))
      }
    : {
        summary: result?.states?.resourceAvailability === "legacy_unrestricted"
          ? "Auto · catálogo completo"
          : "Auto",
        setRef: null,
        setCount: 0,
        packageCount: null,
        editable: canOverride && resourceParameter?.locked !== true && stale !== true,
        sets: []
      };
  const conflictOperations = pendingOperations.filter((entry) => entry?.status === "conflict");
  const queuedOperations = pendingOperations.filter((entry) => entry?.status === "pending");
  return {
    workspaceId: text(slice?.workspaceId || result?.workspace?.id),
    revision: Number(slice?.revision || result?.workspace?.revision),
    scopeTitle: text(result?.microsequence?.title) || "Microssequência",
    microsequencePath: structuredClone(list(result?.microsequence?.path)),
    stale: stale === true,
    pending: conflictOperations.length === 0 && queuedOperations.length > 0,
    pendingCount: conflictOperations.length === 0 ? queuedOperations.length : 0,
    conflict: conflictOperations.length > 0,
    conflictCount: conflictOperations.length,
    parameters,
    resources,
    capabilities: { design: canOverride }
  };
}

export function resolveProjectedFindingTarget(overview, findingId) {
  const finding = list(overview?.findings).find((entry) => entry.findingId === findingId);
  return finding
    ? {
        readerTarget: finding.readerTarget == null
          ? null
          : structuredClone(finding.readerTarget),
        returnContext: structuredClone(finding.returnContext)
      }
    : null;
}
