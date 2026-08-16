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
  Object.freeze({ key: "audit", label: "Auditoria", icon: "review" })
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

export function sameEntityPath(left, right) {
  const first = normalizedPath(left, { exactLength: 4 });
  const second = normalizedPath(right, { exactLength: 4 });
  return Boolean(first && second && first.every((value, index) => value === second[index]));
}
