// O controller fornece o estado canônico; este módulo limita-se ao view-model
// tolerante necessário ao renderer e a respostas em cache de versões anteriores.
const WORKSPACE_STATES = Object.freeze({
  planning: Object.freeze({ label: "Em planejamento", icon: "draft-state" }),
  building: Object.freeze({ label: "Em construção", icon: "progress" }),
  audit_pending: Object.freeze({ label: "Auditoria pendente", icon: "review" }),
  ready: Object.freeze({ label: "Sem pendência corrente", icon: "ready-state" })
});

const MICROSEQUENCE_STATES = Object.freeze({
  missing: Object.freeze({ label: "Indisponível", icon: "remove-state" }),
  planned: Object.freeze({ label: "Planejada", icon: "draft-state" }),
  analyzed: Object.freeze({ label: "Analisada", icon: "intent" }),
  materialized: Object.freeze({ label: "Com conteúdo", icon: "progress" }),
  audit_pending: Object.freeze({ label: "Com achado pendente", icon: "review" }),
  ready: Object.freeze({ label: "Pronta", icon: "ready-state" })
});

export const AUTHORING_AUDIT_DIMENSIONS = Object.freeze([
  Object.freeze({ key: "structure", label: "Estrutura" }),
  Object.freeze({ key: "design", label: "Desenho" }),
  Object.freeze({ key: "practice", label: "Prática" }),
  Object.freeze({ key: "resources", label: "Resources" }),
  Object.freeze({ key: "coverage", label: "Cobertura", partOnly: true }),
  Object.freeze({ key: "coherence", label: "Coerência", partOnly: true }),
  Object.freeze({ key: "dependencies", label: "Dependências", partOnly: true }),
  Object.freeze({ key: "redundancy", label: "Redundância", partOnly: true }),
  Object.freeze({ key: "integration", label: "Integração", partOnly: true })
]);

export const AUTHORING_DESTINATION_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "map", label: "Mapa", icon: "graph" }),
  Object.freeze({ key: "design", label: "Desenho", icon: "intent" }),
  Object.freeze({ key: "content", label: "Conteúdo", icon: "card" }),
  Object.freeze({ key: "audit", label: "Auditoria", icon: "review" }),
  Object.freeze({ key: "results", label: "Resultados", icon: "graph" })
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function titleFromIdentifier(value) {
  return text(value)
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .replace(/^./u, (character) => character.toLocaleUpperCase("pt-BR"));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function nullableInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedRef(value, { nullableVersion = false } = {}) {
  const id = text(value?.id);
  if (!id) return null;
  const version = text(value?.version);
  return Object.freeze({
    id,
    ...(nullableVersion ? { version: value?.version == null ? null : version || null } :
      version ? { version } : {})
  });
}

function normalizedRuleRef(value) {
  const reference = normalizedRef(value, { nullableVersion: true });
  const kind = text(value?.kind);
  return reference && kind ? Object.freeze({ kind, id: reference.id, version: reference.version }) : null;
}

function normalizedArtifactRefs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const entries = Object.entries(value).flatMap(([key, raw]) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.items)) {
      const items = raw.items.flatMap((item) => {
        const reference = normalizedRef(item);
        if (reference) return [reference];
        const identifier = text(item);
        return identifier ? [identifier] : [];
      });
      const count = Math.max(integer(raw.count), items.length);
      return items.length || count
        ? [[key, Object.freeze({
            items: Object.freeze(items),
            count,
            truncated: raw.truncated === true || count > items.length
          })]]
        : [];
    }
    if (Array.isArray(raw)) {
      const references = raw.map((item) => normalizedRef(item)).filter(Boolean);
      return references.length ? [[key, Object.freeze(references)]] : [];
    }
    const reference = normalizedRef(raw);
    return reference ? [[key, reference]] : [];
  });
  return Object.freeze(Object.fromEntries(entries));
}

function normalizedAuditSummary(value, { part = false } = {}) {
  const source = value?.dimensions && typeof value.dimensions === "object"
    ? value.dimensions
    : value && typeof value === "object" ? value : {};
  const dimensions = AUTHORING_AUDIT_DIMENSIONS
    .filter((definition) => part || definition.partOnly !== true)
    .map((definition) => {
      const raw = source[definition.key];
      const candidate = text(typeof raw === "string" ? raw : raw?.status);
      const status = ["conformant", "finding", "not_checked"].includes(candidate)
        ? candidate
        : "not_checked";
      return Object.freeze({
        ...definition,
        status,
        findingCount: integer(raw?.findingCount)
      });
    });
  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    findingCount: integer(value?.findingCount ?? value?.deterministicFindingCount),
    explicit: dimensions.some(({ status }) => status !== "not_checked") || value?.explicit === true
  });
}

function normalizedAuditRun(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scope = value.scope && typeof value.scope === "object"
    ? Object.freeze({ kind: text(value.scope.kind), ref: text(value.scope.ref) })
    : null;
  return Object.freeze({
    ref: normalizedRef(value.ref),
    kind: text(value.kind),
    status: text(value.status) || "pending",
    current: value.current === true,
    scope,
    startedRevision: nullableInteger(value.startedRevision),
    completedRevision: nullableInteger(value.completedRevision),
    createdAt: text(value.createdAt) || null,
    completedAt: text(value.completedAt) || null
  });
}

function normalizedAuditComponents(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const items = list(source.items).flatMap((item) => {
    const microsequenceRef = text(item?.microsequenceRef);
    if (!microsequenceRef) return [];
    const microsequencePath = normalizedPath(item?.microsequencePath, { exactLength: 4 });
    return [Object.freeze({
      ordinal: nullableInteger(item?.ordinal),
      microsequenceRef,
      microsequencePath,
      childAuditRunRef: normalizedRef(item?.childAuditRunRef),
      auditedRevision: nullableInteger(item?.auditedRevision),
      contentHash: text(item?.contentHash) || null,
      status: item?.status === "complete" ? "complete" : "not_audited",
      targetAvailable: item?.targetAvailable === true
    })];
  });
  return Object.freeze({
    items: Object.freeze(items),
    count: Math.max(items.length, integer(source.count)),
    nextCursor: text(source.nextCursor) || null,
    truncated: source.truncated === true
  });
}

function normalizedMandate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.freeze({
    id: text(value.id),
    kind: text(value.kind),
    targetPartId: text(value.targetPartId) || null,
    findingIds: Object.freeze(list(value.findingIds).map(text).filter(Boolean)),
    note: text(value.note),
    decidedAtRevision: nullableInteger(value.decidedAtRevision)
  });
}

function normalizedPath(value, { exactLength = null } = {}) {
  const path = list(value).map(text);
  const lengthIsValid = exactLength === null
    ? path.length >= 1 && path.length <= 5
    : path.length === exactLength;
  return lengthIsValid && path.every(Boolean) ? path : null;
}

function normalizedState(value, states, fallback) {
  const candidate = text(value?.key || value?.status || value?.state || value);
  return Object.hasOwn(states, candidate) ? candidate : fallback;
}

function stateProjection(value, states, fallback, explicitLabel = "") {
  const key = normalizedState(value, states, fallback);
  return Object.freeze({
    key,
    label: text(explicitLabel || value?.label) || states[key].label,
    icon: states[key].icon
  });
}

function inferWorkspaceState(item) {
  const findings = integer(item?.findingCount ?? item?.findings?.activeCount);
  const materialized = integer(item?.materializedCount);
  const planned = integer(item?.plannedCount ?? item?.microsequenceCount);
  if (findings > 0) return "audit_pending";
  if (planned > 0 && materialized >= planned) return "ready";
  if (materialized > 0 || item?.mandate) return "building";
  return "planning";
}

export function createAuthoringDestinationRegistry(additionalDefinitions = []) {
  const definitions = [...AUTHORING_DESTINATION_DEFINITIONS, ...list(additionalDefinitions)];
  const seen = new Set();
  return Object.freeze(definitions.map((definition) => {
    const key = text(definition?.key);
    const label = text(definition?.label);
    const icon = text(definition?.icon);
    if (!key || !label || !icon || seen.has(key)) {
      throw new TypeError("Destino de Autoria inválido ou duplicado.");
    }
    seen.add(key);
    return Object.freeze({
      key,
      label,
      icon,
      available: typeof definition.available === "function"
        ? definition.available
        : () => definition.available !== false
    });
  }));
}

export function normalizeAuthoringWorkspaceList(value) {
  const source = value?.workspaceList || value || {};
  const items = list(source.items || source.workspaces).flatMap((item) => {
    const workspaceId = text(item?.workspaceId || item?.id);
    if (!workspaceId) return [];
    const state = stateProjection(
      item?.status || item?.state,
      WORKSPACE_STATES,
      inferWorkspaceState(item),
      item?.statusLabel || item?.stateLabel
    );
    return [Object.freeze({
      workspaceId,
      title: text(item?.title || item?.name) || "Workspace sem nome",
      state,
      pending: item?.pending === true,
      conflict: item?.conflict === true || text(item?.syncState) === "conflict" ||
        text(item?.pendingStatus) === "conflict",
      stale: item?.stale === true,
      capabilities: Object.freeze({ ...(item?.capabilities || {}) })
    })];
  });
  return Object.freeze({
    items: Object.freeze(items),
    stale: source.stale === true,
    pendingCount: integer(source.pendingCount ?? items.filter((item) => item.pending).length)
  });
}

function microsequenceStateFromMask(maskValue) {
  const mask = text(maskValue).toLowerCase();
  if (mask === "r") return "ready";
  if (mask === "m") return "materialized";
  if (mask === "a") return "analyzed";
  if (mask === "f") return "audit_pending";
  return "planned";
}

function inferMicrosequenceState(item, maskValue = "") {
  if (integer(item?.findingCount) > 0 || item?.hasFindings === true) return "audit_pending";
  if (item?.ready === true) return "ready";
  if (item?.materialized === true) return "materialized";
  if (item?.analyzed === true) return "analyzed";
  return microsequenceStateFromMask(maskValue);
}

function normalizeMicrosequence(item, { mask = "", fallbackTitle = "Microssequência" } = {}) {
  const entityPath = normalizedPath(
    item?.entityPath || item?.path || item?.readerTarget?.entityPath,
    { exactLength: 4 }
  );
  const state = stateProjection(
    item?.status || item?.state,
    MICROSEQUENCE_STATES,
    inferMicrosequenceState(item, mask),
    item?.statusLabel || item?.stateLabel
  );
  return Object.freeze({
    key: text(item?.key || item?.microsequenceId || item?.id) || entityPath?.at(-1) || fallbackTitle,
    title: text(item?.title || item?.name) || fallbackTitle,
    entityPath,
    state,
    findingCount: integer(item?.findingCount),
    pending: item?.pending === true,
    conflict: item?.conflict === true || text(item?.pendingStatus) === "conflict",
    auditSummary: normalizedAuditSummary(item?.auditSummary || item?.audit?.summary),
    auditRunRef: normalizedRef(item?.auditRunRef || item?.audit?.latestAuditRun?.ref),
    readerTarget: Object.freeze({
      ...(item?.readerTarget || {}),
      ...(entityPath ? { entityPath } : {})
    })
  });
}

function normalizePart(part, index) {
  const coordinationPartId = text(part?.partId || part?.id || part?.key);
  const explicitMicrosequences = list(part?.microsequences || part?.items);
  const ids = list(part?.microsequenceIds);
  const mask = text(part?.microsequenceStateMask);
  const source = explicitMicrosequences.length
    ? explicitMicrosequences
    : ids.map((id) => ({ id, title: "Microssequência" }));
  const microsequences = source.map((item, microsequenceIndex) => normalizeMicrosequence(item, {
    mask: mask[microsequenceIndex] || "",
    fallbackTitle: `Microssequência ${microsequenceIndex + 1}`
  }));
  return Object.freeze({
    partId: coordinationPartId || `part-${index + 1}`,
    coordinationPartId: coordinationPartId || null,
    title: text(part?.title || part?.name) || `Parte ${index + 1}`,
    state: stateProjection(
      part?.status || part?.state,
      MICROSEQUENCE_STATES,
      microsequences.length > 0 && microsequences.every((item) => item.state.key === "ready")
        ? "ready"
        : microsequences.some((item) => item.state.key === "audit_pending")
          ? "audit_pending"
          : microsequences.some((item) => ["analyzed", "materialized", "ready"].includes(item.state.key))
            ? "materialized"
            : "planned",
      part?.statusLabel || part?.stateLabel
    ),
    auditSummary: normalizedAuditSummary(part?.auditSummary || part?.audit?.summary, { part: true }),
    auditRunRef: normalizedRef(part?.auditRunRef || part?.audit?.latestAuditRun?.ref),
    microsequences: Object.freeze(microsequences)
  });
}

function normalizeFinding(finding, index) {
  const findingId = text(finding?.findingId || finding?.observationId || finding?.id) || `finding-${index + 1}`;
  const code = text(finding?.code || finding?.findingCode || finding?.category);
  const targetAvailable = finding?.targetAvailable !== false;
  const target = finding?.target && typeof finding.target === "object" ? finding.target : null;
  const readerTarget = targetAvailable ? finding?.readerTarget || target || null : null;
  const entityPath = targetAvailable
    ? normalizedPath(readerTarget?.entityPath || finding?.entityPath)
    : null;
  const originValue = text(finding?.origin || finding?.findingOrigin);
  const auditRunRef = normalizedRef(finding?.auditRunRef);
  const verificationAuditRunRef = normalizedRef(finding?.verificationAuditRunRef);
  const ruleRef = normalizedRuleRef(finding?.ruleRef);
  const artifactRefs = normalizedArtifactRefs(finding?.artifactRefs);
  const structuredMarker = Boolean(
    auditRunRef || verificationAuditRunRef || ruleRef || Object.keys(artifactRefs).length ||
    ["deterministic", "semantic_audit"].includes(originValue) ||
    text(finding?.code || finding?.findingCode) || text(finding?.publicEvidence) ||
    text(finding?.auditPartId)
  );
  const legacyCompatible = finding?.legacyCompatible === true
    ? true
    : finding?.legacyCompatible === false ? false : !structuredMarker;
  return Object.freeze({
    findingId,
    summary: text(finding?.summary || finding?.title || finding?.body) ||
      titleFromIdentifier(code) || "Achado sem síntese.",
    code,
    category: text(finding?.category),
    origin: ["deterministic", "semantic_audit"].includes(originValue)
      ? originValue
      : "legacy",
    publicEvidence: text(finding?.publicEvidence || finding?.evidence || finding?.body),
    ruleRef,
    severity: text(finding?.severity) || "medium",
    status: text(finding?.status) || "open",
    proposedRepair: text(finding?.proposedRepair) || null,
    auditRunRef,
    verificationAuditRunRef,
    artifactRefs,
    legacyCompatible,
    auditRevision: nullableInteger(finding?.auditRevision ?? finding?.detectedRevision),
    resultingRevision: nullableInteger(finding?.resultingRevision),
    verification: text(finding?.verification) || null,
    auditPartId: text(finding?.auditPartId) || null,
    entityType: text(target?.entityType || finding?.entityType),
    targetAvailable,
    returnContext: Object.freeze({ ...(finding?.returnContext || {}) }),
    readerTarget: readerTarget
      ? Object.freeze({ ...readerTarget, ...(entityPath ? { entityPath } : {}) })
      : null
  });
}

export function normalizeAuthoringAuditSlice(value) {
  const source = value?.audit || value?.result?.audit || value || {};
  const findings = list(source.findings).map(normalizeFinding);
  return Object.freeze({
    workspaceId: text(value?.workspaceId || value?.result?.workspaceId),
    revision: integer(value?.revision || value?.result?.revision),
    stale: value?.stale === true,
    latestAuditRun: normalizedAuditRun(source.latestAuditRun),
    summary: normalizedAuditSummary(source.summary, {
      part: text(source.latestAuditRun?.scope?.kind) === "part"
    }),
    components: normalizedAuditComponents(source.components),
    findings: Object.freeze(findings),
    total: Math.max(integer(source.total), findings.length),
    nextCursor: source.nextCursor == null ? null : structuredClone(source.nextCursor),
    truncated: source.truncated === true,
    coordination: Object.freeze({ ...(value?.coordination || value?.result?.coordination || {}) }),
    capabilities: Object.freeze({ ...(value?.capabilities || value?.result?.capabilities || {}) })
  });
}

export function normalizeAuthoringWorkspaceOverview(value) {
  const source = value?.workspace || value || {};
  const content = source.content || source.overview || source;
  const map = content.map || content;
  const parts = list(map.parts).map(normalizePart);
  const findingsValue = content.audit?.findings || content.findings || source.findings || [];
  const findings = list(findingsValue.items || findingsValue).map(normalizeFinding);
  const workspaceId = text(source.workspaceId || source.id);
  if (!workspaceId) throw new TypeError("Workspace de Autoria sem identidade.");
  return Object.freeze({
    workspaceId,
    title: text(source.title || source.name) || "Workspace sem nome",
    revision: integer(source.revision),
    stale: source.stale === true,
    pending: source.pending === true,
    conflict: source.conflict === true || text(source.syncState) === "conflict",
    state: stateProjection(
      source.status || source.state,
      WORKSPACE_STATES,
      inferWorkspaceState({
        ...source,
        findingCount: findings.length,
        microsequenceCount: parts.reduce((total, part) => total + part.microsequences.length, 0),
        materializedCount: parts.reduce(
          (total, part) => total + part.microsequences.filter((item) =>
            ["materialized", "audit_pending", "ready"].includes(item.state.key)
          ).length,
          0
        )
      }),
      source.statusLabel || source.stateLabel
    ),
    parts: Object.freeze(parts),
    findings: Object.freeze(findings),
    findingsTotal: Math.max(
      integer(source.findingsTotal ?? findingsValue.summary?.activeCount ?? findingsValue.total),
      findings.length
    ),
    findingsTruncated: source.findingsTruncated === true || findingsValue.truncated === true,
    findingsNextCursor: source.findingsNextCursor == null && findingsValue.nextCursor == null
      ? null
      : structuredClone(source.findingsNextCursor ?? findingsValue.nextCursor),
    audit: normalizeAuthoringAuditSlice(content.audit || source.audit || {}),
    mandate: normalizedMandate(source.mandate || content.mandate || content.coordination?.mandate),
    capabilities: Object.freeze({ ...(source.capabilities || content.capabilities || {}) }),
    readerTarget: Object.freeze({ ...(source.readerTarget || content.readerTarget || {}) }),
    returnContext: Object.freeze({ ...(source.returnContext || {}) })
  });
}

function normalizeParameter(parameter, index) {
  const structuredDefinitionRef = parameter?.definitionRef && typeof parameter.definitionRef === "object"
    ? {
        id: text(parameter.definitionRef.id),
        version: text(parameter.definitionRef.version)
      }
    : null;
  const key = text(
    parameter?.key || parameter?.parameterKey || structuredDefinitionRef?.id || parameter?.definitionRef
  );
  const sourceKey = text(parameter?.source || parameter?.origin).toLowerCase();
  const locked = parameter?.locked === true || sourceKey === "research_locked";
  const conflict = parameter?.conflict === true || text(parameter?.pendingStatus) === "conflict";
  const sourceLabel = text(parameter?.sourceLabel || parameter?.originLabel) || (
    locked
      ? "Bloqueado por pesquisa"
      : sourceKey === "manual"
        ? "Definido pelo autor"
        : sourceKey === "inherited"
          ? "Herdado"
          : "Automático"
  );
  const rawOptions = list(parameter?.options || parameter?.control?.options);
  const options = rawOptions.map((option) => Object.freeze({
    value: option && typeof option === "object" ? option.value : option,
    label: text(option && typeof option === "object" ? option.label : "") || String(
      option && typeof option === "object" ? option.value : option
    )
  }));
  const range = parameter?.range || parameter?.control?.range || parameter?.control || {};
  const structuredValue = parameter?.value && typeof parameter.value === "object" &&
    !Array.isArray(parameter.value)
    ? structuredClone(parameter.value)
    : parameter?.value;
  const editableValue = structuredValue && typeof structuredValue === "object" &&
    ["integer", "number", "enum", "boolean"].includes(text(structuredValue.kind))
    ? structuredValue.value
    : structuredValue;
  return Object.freeze({
    key: key || `parameter-${index + 1}`,
    definitionRef: Object.freeze(structuredDefinitionRef?.id && structuredDefinitionRef?.version
      ? structuredDefinitionRef
      : { id: key, version: "" }),
    assignmentRef: parameter?.assignmentRef && typeof parameter.assignmentRef === "object"
      ? Object.freeze({
          id: text(parameter.assignmentRef.id),
          version: text(parameter.assignmentRef.version)
        })
      : null,
    label: text(parameter?.label || parameter?.title) || "Parâmetro",
    value: structuredValue,
    editableValue,
    valueText: text(
      parameter?.valueText || parameter?.valueLabel || parameter?.effectiveValueText || parameter?.displayValue
    ) || "Ainda não resolvido",
    source: sourceKey || (locked ? "research_locked" : "auto"),
    sourceLabel,
    locked,
    editable: parameter?.editable !== false && !locked && !conflict,
    pending: parameter?.pending === true,
    conflict,
    pendingStatus: text(parameter?.pendingStatus),
    pendingRequestId: text(parameter?.pendingRequestId || parameter?.requestId),
    conflictMessage: text(parameter?.conflictMessage),
    options: Object.freeze(options),
    range: Object.freeze({
      min: Number.isFinite(Number(range.min)) ? Number(range.min) : null,
      max: Number.isFinite(Number(range.max)) ? Number(range.max) : null,
      step: Number.isFinite(Number(range.step)) && Number(range.step) > 0 ? Number(range.step) : 1
    }),
    unitLabel: text(parameter?.unitLabel || parameter?.unit)
  });
}

export function normalizeAuthoringDesign(value) {
  const source = value?.design || value || {};
  const parameters = list(source.parameters || source.items).map(normalizeParameter);
  const entityPath = normalizedPath(source.microsequencePath || source.entityPath, { exactLength: 4 });
  return Object.freeze({
    workspaceId: text(source.workspaceId),
    revision: integer(source.revision),
    scopeTitle: text(source.scopeTitle || source.title) || "Desenho da microssequência",
    entityPath,
    stale: source.stale === true,
    pending: source.pending === true,
    conflict: source.conflict === true || text(source.syncState) === "conflict",
    parameters: Object.freeze(parameters),
    resources: Object.freeze({
      summary: text(source.resources?.summary || source.resourceSummary) || "Auto · catálogo completo",
      editable: source.resources?.editable === true,
      pending: source.resources?.pending === true
    })
  });
}

const EXPERIMENT_STATUSES = Object.freeze(new Set([
  "draft",
  "validated",
  "generating",
  "ready",
  "correction_required",
  "collecting",
  "paused",
  "closed",
  "invalidated"
]));

const EXPERIMENT_STATUS_LABELS = Object.freeze({
  draft: "Protocolo em rascunho",
  validated: "Protocolo validado",
  generating: "Gerando variantes",
  ready: "Variantes auditadas",
  correction_required: "Correções necessárias",
  collecting: "Coleta em andamento",
  paused: "Coleta pausada",
  closed: "Coleta encerrada",
  invalidated: "Experimento invalidado"
});

function normalizedExperimentStatus(value) {
  const status = text(value).toLowerCase();
  return EXPERIMENT_STATUSES.has(status) ? status : "draft";
}

function normalizedExperimentScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value.scope && typeof value.scope === "object" && !Array.isArray(value.scope)
    ? { ...value.scope, label: value.label, entityPath: value.entityPath }
    : value;
  const kind = text(source.kind);
  const ref = text(source.ref);
  if (!["course", "lesson", "microsequence"].includes(kind) || !ref) return null;
  const entityPath = Array.isArray(source.entityPath)
    ? source.entityPath.map(text).filter(Boolean)
    : null;
  return Object.freeze({
    kind,
    ref,
    label: text(source.label) || titleFromIdentifier(ref),
    ...(entityPath?.length ? { entityPath: Object.freeze(entityPath) } : {})
  });
}

function normalizedExperimentRefOption(value, fallbackLabel) {
  const ref = normalizedRef(value?.ref || value);
  if (!ref) return null;
  return Object.freeze({
    ref,
    label: text(value?.label || value?.title) || fallbackLabel,
    approved: value?.approved === true,
    scope: normalizedExperimentScope(value?.scope),
    memberCount: nullableInteger(value?.memberCount),
    description: text(value?.description)
  });
}

function normalizedPageSource(value) {
  const source = Array.isArray(value)
    ? { items: value, count: value.length, nextCursor: null, truncated: false }
    : value && typeof value === "object"
      ? value
      : {};
  const items = list(source.items);
  const count = Math.max(integer(source.count), items.length);
  return {
    items,
    count,
    nextCursor: source.nextCursor == null ? null : structuredClone(source.nextCursor),
    truncated: source.truncated === true || source.nextCursor != null || count > items.length
  };
}

function normalizedExperimentFactorDefinition(value) {
  const ref = normalizedRef(value?.ref || value?.definitionRef || value);
  if (!ref) return null;
  const kind = text(value?.kind).toLowerCase() === "resource_set" ? "resource_set" : "parameter";
  const valueType = text(value?.valueType).toLowerCase() || (kind === "resource_set" ? "resource_set" : "enum");
  const range = value?.range || value?.constraints || {};
  const governedOptions = list(value?.options).length
    ? list(value.options)
    : valueType === "enum"
      ? list(range.allowedEnumValues).map((entry) => ({
          key: text(entry), label: titleFromIdentifier(entry), value: { kind: "enum", value: text(entry) }
        }))
      : [];
  const options = governedOptions.flatMap((option, index) => {
    const optionValue = option && typeof option === "object" ? option.value : option;
    if (!optionValue || typeof optionValue !== "object" || Array.isArray(optionValue) ||
        !text(optionValue.kind)) return [];
    return [Object.freeze({
      key: text(option?.key || option?.id) || `option-${index + 1}`,
      value: structuredClone(optionValue),
      label: text(option?.label) || `Opção ${index + 1}`
    })];
  });
  return Object.freeze({
    ref,
    label: text(value?.label || value?.title) || titleFromIdentifier(ref.id),
    kind,
    valueType,
    unitLabel: text(value?.unitLabel || value?.unit),
    supportedScopes: Object.freeze(list(value?.supportedScopes || value?.scopes).map(text).filter((kind) => (
      ["course", "lesson", "microsequence"].includes(kind)
    ))),
    constraints: Object.freeze(structuredClone(range)),
    range: Object.freeze({
      min: Number.isFinite(Number(range.minimum ?? range.min)) ? Number(range.minimum ?? range.min) : null,
      max: Number.isFinite(Number(range.maximum ?? range.max)) ? Number(range.maximum ?? range.max) : null,
      step: Number.isFinite(Number(range.step)) && Number(range.step) > 0 ? Number(range.step) : 1
    }),
    options: Object.freeze(options)
  });
}

function normalizedExperimentOptions(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalizePage = (key, normalizer) => {
    const page = normalizedPageSource(source[key]);
    return Object.freeze({
      items: Object.freeze(page.items.map(normalizer).filter(Boolean)),
      count: page.count,
      nextCursor: page.nextCursor,
      truncated: page.truncated
    });
  };
  const pages = {
    scopes: normalizePage("scopes", normalizedExperimentScope),
    bases: normalizePage("bases", (item) => normalizedExperimentRefOption(item, "Base aprovada")),
    factorDefinitions: normalizePage("factorDefinitions", normalizedExperimentFactorDefinition),
    resourceSets: normalizePage("resourceSets", (item) => (
      normalizedExperimentRefOption(item, "Conjunto de Resources")
    )),
    consentPolicies: normalizePage("consentPolicies", (item) => (
      normalizedExperimentRefOption(item, "Política de consentimento")
    )),
    instruments: normalizePage("instruments", (item) => normalizedExperimentRefOption(item, "Instrumento")),
    outcomes: normalizePage("outcomes", (item) => normalizedExperimentRefOption(item, "Outcome"))
  };
  pages.bases = Object.freeze({
    ...pages.bases,
    items: Object.freeze(pages.bases.items.filter((item) => item?.approved))
  });
  return Object.freeze({
    optionsSetRef: normalizedRef(source.optionsSetRef),
    scopes: pages.scopes.items,
    bases: pages.bases.items,
    factorDefinitions: pages.factorDefinitions.items,
    resourceSets: pages.resourceSets.items,
    consentPolicies: pages.consentPolicies.items,
    instruments: pages.instruments.items,
    outcomes: pages.outcomes.items,
    pages: Object.freeze(pages)
  });
}

const EXPERIMENT_OPTION_PROPERTIES = Object.freeze({
  scope: ["scopes", normalizedExperimentScope],
  base: ["bases", (item) => normalizedExperimentRefOption(item, "Base aprovada")],
  factor_definition: ["factorDefinitions", normalizedExperimentFactorDefinition],
  resource_set: ["resourceSets", (item) => normalizedExperimentRefOption(item, "Conjunto de Resources")],
  consent_policy: ["consentPolicies", (item) => normalizedExperimentRefOption(item, "Política de consentimento")],
  instrument: ["instruments", (item) => normalizedExperimentRefOption(item, "Instrumento")],
  outcome: ["outcomes", (item) => normalizedExperimentRefOption(item, "Outcome")]
});

export function normalizeAuthoringExperimentOptionPage(value) {
  const kind = text(value?.kind);
  const definition = EXPERIMENT_OPTION_PROPERTIES[kind];
  if (!definition) throw new TypeError("Página de opções experimentais sem categoria válida.");
  const page = normalizedPageSource(value);
  const items = page.items.map(definition[1]).filter((item) => (
    kind !== "base" || item?.approved
  )).filter(Boolean);
  return Object.freeze({
    workspaceId: text(value?.workspaceId),
    workspaceRevision: integer(value?.workspaceRevision),
    optionsSetRef: normalizedRef(value?.optionsSetRef),
    kind,
    property: definition[0],
    items: Object.freeze(items),
    count: page.count,
    nextCursor: page.nextCursor,
    truncated: page.truncated
  });
}

function normalizedExperimentListItem(value, index) {
  const experimentId = text(value?.experimentId || value?.id);
  if (!experimentId) return null;
  const status = normalizedExperimentStatus(value?.status || value?.state);
  return Object.freeze({
    experimentId,
    title: text(value?.title) || `Experimento ${index + 1}`,
    status,
    statusLabel: text(value?.statusLabel) || EXPERIMENT_STATUS_LABELS[status],
    experimentRevision: integer(value?.experimentRevision ?? value?.revision),
    protocolRevision: nullableInteger(value?.protocolRevision),
    scope: normalizedExperimentScope(value?.scope),
    factorCount: integer(value?.factorCount ?? value?.factors?.length),
    conditionCount: integer(value?.conditionCount ?? value?.conditions?.length),
    variantCount: integer(value?.variantCount ?? value?.variants?.length),
    updatedAt: text(value?.updatedAt) || null
  });
}

export function normalizeAuthoringExperimentList(value) {
  const source = value?.experiments || value?.result?.experiments || value || {};
  const page = normalizedPageSource(Array.isArray(source.experiments)
    ? { ...source, items: source.experiments }
    : source);
  const items = page.items
    .map(normalizedExperimentListItem).filter(Boolean);
  return Object.freeze({
    workspaceId: text(value?.workspaceId || source.workspaceId),
    workspaceRevision: integer(
      value?.workspaceRevision ?? source.workspaceRevision ?? value?.revision ?? source.revision
    ),
    experimentSetRef: normalizedRef(value?.experimentSetRef || source.experimentSetRef),
    stale: value?.stale === true || source.stale === true,
    items: Object.freeze(items),
    count: page.count,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    options: normalizedExperimentOptions(source.options || value?.options)
  });
}

function normalizedExperimentFactor(value, index) {
  const definition = normalizedExperimentFactorDefinition(value);
  if (!definition) return null;
  return Object.freeze({
    ...definition,
    factorId: text(value?.factorId || value?.id) || `factor-${index + 1}`,
    targets: Object.freeze(list(value?.targets).map(normalizedExperimentScope).filter(Boolean))
  });
}

function normalizedConditionValue(value) {
  const factorId = text(value?.factorId);
  if (!factorId) return null;
  return Object.freeze({
    factorId,
    value: value?.value == null ? null : structuredClone(value.value),
    valueText: text(value?.valueText || value?.label),
    resourceSetRef: normalizedRef(value?.resourceSetRef),
    resourceSetLabel: text(value?.resourceSetLabel),
    allowedCount: nullableInteger(value?.allowedCount)
  });
}

function normalizedExperimentCondition(value, index) {
  const conditionId = text(value?.conditionId || value?.id) || `condition-${index + 1}`;
  return Object.freeze({
    conditionId,
    conditionRef: normalizedRef(value?.conditionRef || value?.ref),
    label: text(value?.label || value?.title) || `Condição ${String.fromCharCode(65 + index)}`,
    values: Object.freeze(list(value?.values || value?.assignments)
      .map(normalizedConditionValue).filter(Boolean))
  });
}

function normalizedResourceSummary(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const items = list(source.items || (Array.isArray(value) ? value : [])).flatMap((item) => {
    const ref = normalizedRef(item?.ref || item?.packageRef || item);
    if (!ref) return [];
    return [Object.freeze({
      ref,
      label: text(item?.label || item?.title) || `${ref.id}@${ref.version}`,
      role: text(item?.role)
    })];
  });
  return Object.freeze({
    items: Object.freeze(items),
    count: Math.max(integer(source.count), items.length),
    truncated: source.truncated === true || integer(source.count) > items.length
  });
}

function normalizedExperimentDifference(value, index) {
  const differenceRef = normalizedRef(value?.differenceRef || value?.ref);
  const differenceId = differenceRef
    ? `${differenceRef.id}@${differenceRef.version}`
    : text(value?.differenceId || value?.id) || `difference-${index + 1}`;
  const category = [
    "directly_required", "inevitable_derived", "accidental_unplanned"
  ].includes(text(value?.classification || value?.category))
    ? text(value?.classification || value?.category)
    : "accidental_unplanned";
  const decisionValue = typeof value?.humanDecision === "string"
    ? value.humanDecision
    : value?.humanDecision?.decision || value?.decision;
  const decision = ["pending", "correct", "accept", "invalidate"].includes(text(decisionValue))
    ? text(decisionValue)
    : "pending";
  const path = text(value?.path);
  const beforeSummary = text(value?.beforeSummary);
  const afterSummary = text(value?.afterSummary);
  const factualDescription = [
    path ? `Local: ${path}.` : "",
    beforeSummary ? `Antes: ${beforeSummary}` : "",
    afterSummary ? `Depois: ${afterSummary}` : ""
  ].filter(Boolean).join(" ");
  return Object.freeze({
    differenceId,
    differenceRef,
    category,
    classification: category,
    decision,
    humanDecision: decision === "pending" ? null : decision,
    rationale: text(value?.publicRationale || value?.humanDecision?.rationale ||
      value?.humanDecision?.note || value?.note),
    label: text(value?.label || value?.title || value?.kind) || "Diferença registrada",
    description: text(value?.description || value?.summary) || factualDescription,
    path,
    kind: text(value?.kind),
    beforeSummary: beforeSummary || null,
    afterSummary: afterSummary || null,
    evidenceRefs: Object.freeze(list(value?.evidenceRefs).map(text).filter(Boolean)),
    requiresParticipantContinuity: value?.requiresParticipantContinuity === true,
    allowedResources: normalizedResourceSummary(value?.allowedResources),
    materializedResources: normalizedResourceSummary(value?.materializedResources)
  });
}

function normalizedExperimentDifferenceRun(value, index) {
  const differenceRunRef = normalizedRef(value?.differenceRef || value?.differenceRunRef || value?.ref);
  if (!differenceRunRef) return null;
  const baselineSource = value?.baselineRef || value?.baseline || {};
  const baselineKind = ["variant", "variant_revision"].includes(text(baselineSource?.kind))
    ? "variant_revision"
    : "base";
  const hunkCount = integer(value?.hunkCount ?? value?.count ?? value?.differenceCount);
  const classifiedCount = Math.min(
    hunkCount,
    integer(value?.classifiedCount ?? (value?.pendingCount == null
      ? 0
      : hunkCount - integer(value.pendingCount)))
  );
  return Object.freeze({
    runId: `${differenceRunRef.id}@${differenceRunRef.version}`,
    differenceRunRef,
    label: text(value?.label || value?.title) || `Comparação ${index + 1}`,
    baseline: Object.freeze({
      kind: baselineKind,
      ref: normalizedRef(baselineSource?.ref)
    }),
    baselineLabel: text(value?.baselineLabel) || (baselineKind === "base" ? "Base" : "Variante de referência"),
    candidateVariantRevisionRef: normalizedRef(value?.candidateVariantRevisionRef),
    candidateLabel: text(value?.candidateLabel || value?.conditionLabel) || "Variante candidata",
    state: text(value?.state || value?.status),
    count: hunkCount,
    hunkCount,
    classifiedCount,
    pendingCount: Math.max(0, hunkCount - classifiedCount),
    decision: text(value?.decision) || null,
    requiresParticipantContinuity: value?.requiresParticipantContinuity === true
  });
}

function normalizedExperimentVariant(value, index) {
  const variantRevisionRef = normalizedRef(value?.variantRevisionRef || value?.ref);
  if (!variantRevisionRef) return null;
  const variantId = `${variantRevisionRef.id}@${variantRevisionRef.version}`;
  return Object.freeze({
    variantId,
    variantRevisionRef,
    conditionId: text(value?.conditionId || value?.conditionRef?.id),
    conditionRef: normalizedRef(value?.conditionRef),
    label: text(value?.label || value?.title) || `Variante ${index + 1}`,
    status: text(value?.status || value?.state) || "pending",
    frozen: value?.frozen === true || Boolean(text(value?.frozenAt)),
    frozenAt: text(value?.frozenAt) || null,
    limitationRefs: Object.freeze(list(value?.limitationRefs).map(normalizedRef).filter(Boolean)),
    baseRef: normalizedRef(value?.baseRef),
    protocolRef: normalizedRef(value?.protocolRef),
    snapshotRef: normalizedRef(value?.snapshotRef),
    materializationRef: normalizedRef(value?.materializationRef),
    auditRunRef: normalizedRef(value?.auditRunRef),
    provenanceHash: text(value?.provenanceHash) || null,
    provenancePinCount: integer(value?.provenancePinCount),
    currentness: value?.currentness && typeof value.currentness === "object" && !Array.isArray(value.currentness)
      ? Object.freeze(structuredClone(value.currentness))
      : Object.freeze({}),
    workspaceRevision: integer(value?.workspaceRevision ?? value?.readerTarget?.workspaceRevision),
    readerTarget: value?.readerTarget && typeof value.readerTarget === "object"
      ? Object.freeze(structuredClone(value.readerTarget))
      : null,
    allowedResources: normalizedResourceSummary(value?.allowedResources),
    materializedResources: normalizedResourceSummary(value?.materializedResources)
  });
}

function normalizedExperimentParticipant(value, index) {
  const enrollmentRef = text(value?.enrollmentRef).toLowerCase();
  if (!enrollmentRef) return null;
  const status = text(value?.status) === "assigned" ? "assigned" : "enrolled";
  return Object.freeze({
    participantKey: enrollmentRef,
    enrollmentRef,
    pseudonymLabel: text(value?.pseudonymLabel) || `Participante ${index + 1}`,
    status,
    assignedConditionRef: normalizedRef(value?.assignedConditionRef)
  });
}

export function normalizeAuthoringExperiment(value) {
  const source = value?.experiment || value?.result?.experiment || value || {};
  const experimentId = text(source.experimentId || source.id);
  if (!experimentId) throw new TypeError("Experimento sem identidade.");
  const allowedSections = new Set(["overview", "protocol", "variants", "differences", "participants"]);
  const section = allowedSections.has(text(source.section)) ? text(source.section) : "overview";
  const protocol = source.protocol && typeof source.protocol === "object" ? source.protocol : source;
  const status = normalizedExperimentStatus(source.status || source.state);
  const actions = source.actions && typeof source.actions === "object" ? source.actions : {};
  const transitionValues = Array.isArray(actions.transitionCollection)
    ? actions.transitionCollection
    : Array.isArray(actions.transitionCollection?.transitions)
      ? actions.transitionCollection.transitions
      : [];
  const transitionAllowed = (key) => actions[key] === true ||
    actions.transitionCollection?.[key] === true || transitionValues.includes(key);
  const rawVariantPage = section === "variants"
    ? source
    : value?.variantPage || source.variantPage || source.variants;
  const variantPage = normalizedPageSource(rawVariantPage);
  const variantSetRef = normalizedRef(
    rawVariantPage?.variantSetRef || source.variantSetRef
  );
  const rawDifferencePage = section === "differences"
    ? source
    : value?.differencePage || source.differencePage || source.differences;
  const differencePage = normalizedPageSource(rawDifferencePage);
  const differenceRunRef = normalizedRef(
    rawDifferencePage?.differenceRunRef || value?.differencePage?.differenceRunRef || source.differencePage?.differenceRunRef ||
    source.differenceRunRef || source.diffRunRef
  );
  const differenceSetRef = normalizedRef(rawDifferencePage?.differenceSetRef || source.differenceSetRef);
  const differenceMode = text(rawDifferencePage?.mode) === "runs" ? "runs" : "hunks";
  const rawParticipantPage = section === "participants" ? source : source.participants;
  const participantPage = normalizedPageSource(rawParticipantPage);
  const participantSetRef = normalizedRef(rawParticipantPage?.participantSetRef || source.participantSetRef);
  const loadedSections = Object.freeze({
    overview: section === "overview",
    protocol: section === "protocol" || (!text(source.section) && Boolean(source.base || source.baseRef)),
    variants: section === "variants" || Array.isArray(source.variants),
    differences: section === "differences" || source.differences != null || source.differencePage != null,
    participants: section === "participants" || source.participants != null
  });
  const assignmentSource = protocol.assignment || source.assignment || {};
  return Object.freeze({
    section,
    loadedSections,
    workspaceId: text(value?.workspaceId || source.workspaceId),
    workspaceRevision: integer(
      value?.workspaceRevision ?? source.workspaceRevision ?? value?.revision ?? source.revision
    ),
    experimentRevision: integer(source.experimentRevision ?? source.revision),
    stale: value?.stale === true || source.stale === true,
    experimentId,
    title: text(source.title || protocol.title) || "Experimento sem título",
    hypothesis: text(source.hypothesis || protocol.hypothesis),
    status,
    statusLabel: text(source.statusLabel) || EXPERIMENT_STATUS_LABELS[status],
    protocolRevision: nullableInteger(source.protocolRevision ?? protocol.protocolRevision),
    protocolRef: normalizedRef(source.protocolRef || protocol.protocolRef),
    base: normalizedExperimentRefOption(protocol.base || protocol.baseRef, "Base aprovada"),
    consentPolicy: normalizedExperimentRefOption(
      protocol.consentPolicy || protocol.consentPolicyRef,
      "Política de consentimento"
    ),
    scope: normalizedExperimentScope(protocol.scope),
    factors: Object.freeze(list(protocol.factors).map(normalizedExperimentFactor).filter(Boolean)),
    conditions: Object.freeze(list(protocol.conditions).map(normalizedExperimentCondition)),
    invariants: Object.freeze(list(protocol.invariants).flatMap((item) => {
      const key = text(item?.key || item?.id || item);
      if (!key) return [];
      return [Object.freeze({ key, label: text(item?.label) || titleFromIdentifier(key) })];
    })),
    assignment: Object.freeze({
      rule: ["manual", "seeded_random", "balanced_simple"].includes(text(assignmentSource.rule))
        ? text(assignmentSource.rule)
        : "manual",
      seedConfigured: assignmentSource.seedConfigured === true,
      algorithm: text(assignmentSource.algorithm),
      commitment: text(assignmentSource.commitment)
    }),
    enrollment: Object.freeze({
      codeConfigured: source.enrollment?.configured === true || source.enrollment?.codeConfigured === true ||
        source.enrollmentCodeConfigured === true,
      expiresAt: text(source.enrollment?.expiresAt || source.enrollmentExpiresAt) || null
    }),
    instruments: Object.freeze(list(protocol.instruments || protocol.instrumentRefs).map((item) => (
      normalizedExperimentRefOption(item, "Instrumento")
    )).filter(Boolean)),
    outcomes: Object.freeze(list(protocol.outcomes || protocol.outcomeRefs).map((item) => (
      normalizedExperimentRefOption(item, "Outcome")
    )).filter(Boolean)),
    conditionCount: integer(source.conditionCount ?? protocol.conditions?.length),
    variantCount: integer(source.variantCount ?? rawVariantPage?.count),
    differenceCount: integer(source.differenceCount ?? rawDifferencePage?.count),
    participantCount: integer(source.participantCount ?? rawParticipantPage?.count),
    variants: Object.freeze({
      items: Object.freeze(variantPage.items.map(normalizedExperimentVariant).filter(Boolean)),
      count: variantPage.count,
      nextCursor: variantPage.nextCursor,
      truncated: variantPage.truncated,
      variantSetRef,
      experimentRevision: integer(source.experimentRevision ?? source.revision)
    }),
    differences: Object.freeze({
      mode: differenceMode,
      items: Object.freeze(differencePage.items.map((item, index) => (
        differenceMode === "runs"
          ? normalizedExperimentDifferenceRun(item, index)
          : normalizedExperimentDifference(item, index)
      )).filter(Boolean)),
      count: differencePage.count,
      nextCursor: differencePage.nextCursor,
      truncated: differencePage.truncated,
      differenceSetRef,
      differenceRunRef,
      experimentRevision: integer(
        value?.differencePage?.experimentRevision ?? source.differencePage?.experimentRevision ??
        source.experimentRevision ?? source.revision
      )
    }),
    participants: Object.freeze({
      items: Object.freeze(participantPage.items.map(normalizedExperimentParticipant).filter(Boolean)),
      count: participantPage.count,
      nextCursor: participantPage.nextCursor,
      truncated: participantPage.truncated,
      participantSetRef,
      experimentRevision: integer(source.experimentRevision ?? source.revision)
    }),
    actions: Object.freeze({
      saveProtocol: actions.saveProtocol === true || actions.save_protocol === true,
      validate: actions.validate === true,
      generate: actions.generate === true || actions.generateVariants === true,
      decide: actions.decide === true || actions.decideDifference === true,
      requestCorrection: actions.requestCorrection === true ||
        actions.request_correction === true,
      freeze: actions.freeze === true,
      start: actions.start === true || actions.startCollection === true,
      rotateCode: actions.rotateCode === true || actions.rotateEnrollmentCode === true ||
        actions.rotate_enrollment_code === true,
      assign: actions.assign === true || actions.assignParticipant === true,
      pause: transitionAllowed("pause"),
      resume: transitionAllowed("resume"),
      close: transitionAllowed("close"),
      invalidate: transitionAllowed("invalidate")
    })
  });
}

export function mergeAuthoringExperimentSections(current, incoming) {
  if (!current) return incoming;
  if (!incoming || current.experimentId !== incoming.experimentId) {
    throw new TypeError("Seções de experimentos diferentes não podem ser compostas.");
  }
  if (current.experimentRevision !== incoming.experimentRevision) {
    throw new Error("O experimento mudou durante a leitura progressiva.");
  }
  const section = incoming.section;
  const loadedSections = Object.freeze({
    ...current.loadedSections,
    ...incoming.loadedSections,
    [section]: true
  });
  const common = section === "overview" ? {
    title: incoming.title,
    hypothesis: incoming.hypothesis,
    status: incoming.status,
    statusLabel: incoming.statusLabel,
    assignment: incoming.assignment,
    enrollment: incoming.enrollment,
    conditionCount: incoming.conditionCount,
    variantCount: incoming.variantCount,
    differenceCount: incoming.differenceCount,
    participantCount: incoming.participantCount,
    actions: incoming.actions
  } : {};
  const protocol = section === "protocol" ? {
    title: incoming.title,
    hypothesis: incoming.hypothesis,
    protocolRevision: incoming.protocolRevision,
    protocolRef: incoming.protocolRef,
    base: incoming.base,
    consentPolicy: incoming.consentPolicy,
    scope: incoming.scope,
    factors: incoming.factors,
    conditions: incoming.conditions,
    invariants: incoming.invariants,
    assignment: incoming.assignment,
    instruments: incoming.instruments,
    outcomes: incoming.outcomes
  } : {};
  return Object.freeze({
    ...current,
    ...common,
    ...protocol,
    section,
    loadedSections,
    workspaceRevision: incoming.workspaceRevision || current.workspaceRevision,
    stale: current.stale || incoming.stale,
    ...(section === "variants" ? { variants: incoming.variants } : {}),
    ...(section === "differences" ? { differences: incoming.differences } : {}),
    ...(section === "participants" ? { participants: incoming.participants } : {})
  });
}

export function normalizeAuthoringAnalyticsOverview(value) {
  if (!value || value.operation !== "overview" || !Array.isArray(value.sections)) {
    throw new TypeError("Overview de analytics inválido.");
  }
  const normalizedRefValue = normalizedRef(value.overviewSetRef);
  if (!normalizedRefValue) throw new TypeError("Overview de analytics sem pin versionado.");
  const sections = value.sections.map((section) => Object.freeze({
    key: text(section?.key),
    label: text(section?.label),
    question: text(section?.question),
    notice: text(section?.notice),
    empty: section?.empty === true,
    indicators: Object.freeze(list(section?.indicators).map((indicator) => Object.freeze({
      label: text(indicator?.label),
      value: indicator?.value == null ? null : Number(indicator.value),
      unit: text(indicator?.unit)
    }))),
    visualizations: Object.freeze(list(section?.visualizations).map((visualization) => {
      const metricRef = normalizedRef(visualization?.metricRef);
      return Object.freeze({
        key: text(visualization?.key),
        kind: text(visualization?.kind),
        title: text(visualization?.title),
        unit: text(visualization?.unit),
        metricRef,
        truncated: visualization?.truncated === true,
        items: Object.freeze(list(visualization?.items).map((item) => Object.freeze({
          ...structuredClone(item),
          key: text(item?.key),
          label: text(item?.label) || titleFromIdentifier(item?.key),
          value: item?.value == null ? null : Number(item.value),
          missing: item?.missing === true
        })))
      });
    }))
  })).filter((section) => section.key && section.label);
  return Object.freeze({
    operation: "overview",
    workspaceId: text(value.workspaceId),
    workspaceRevision: integer(value.workspaceRevision),
    scope: Object.freeze(structuredClone(value.scope || { kind: "workspace" })),
    overviewSetRef: Object.freeze(normalizedRefValue),
    permissions: Object.freeze(structuredClone(value.permissions || {})),
    sections: Object.freeze(sections)
  });
}

export function sameEntityPath(left, right) {
  const first = normalizedPath(left, { exactLength: 4 });
  const second = normalizedPath(right, { exactLength: 4 });
  return Boolean(first && second && first.every((value, index) => value === second[index]));
}
