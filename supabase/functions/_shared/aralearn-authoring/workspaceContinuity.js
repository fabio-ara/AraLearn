import { AuthoringApiError } from "./errors.js";

export const WORKSPACE_CONTINUITY_VERSION = 1;

const CONTINUITY_STATE_MAX_BYTES = 48 * 1_024;
const CONTINUITY_PART_MAX_ITEMS = 64;
const CONTINUITY_DECISION_MAX_ITEMS = 128;
const CONTINUITY_MANDATE_FINDING_MAX_ITEMS = 50;
const RESUME_SOFT_BUDGET_BYTES = 88 * 1_024;
const ACTION_RESPONSE_LIMIT_BYTES = 96 * 1_024;

export const CONTINUITY_STATE_OPERATIONS = Object.freeze(new Set([
  "record_approved_plan",
  "define_part",
  "remove_part",
  "record_decision",
  "remove_decision",
  "set_mandate",
  "clear_mandate"
]));

export const CONTINUITY_FINDING_OPERATIONS = Object.freeze(new Set([
  "record_finding",
  "decide_finding",
  "link_finding_correction",
  "verify_finding",
  "delete_finding"
]));

const ENTITY_DEPTH = Object.freeze({
  workspace: 0,
  course: 1,
  module: 2,
  lesson: 3,
  microsequence: 4,
  card: 5,
  resource: 5
});
const DECISION_ENTITY_TYPES = new Set([
  "course", "module", "lesson", "microsequence", "card"
]);
const MANDATE_KINDS = new Set([
  "build_part", "repair_findings", "audit", "restructure"
]);
const FINDING_STATUSES = new Set([
  "open", "approved", "rejected", "repaired", "resolved"
]);
const FINDING_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

function fail(code, message, details = undefined) {
  throw new AuthoringApiError(422, code, message, details);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function only(value, fields, label) {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) {
    fail("invalid_authoring_continuity", `${label}.${unknown} não é aceito.`, {
      field: `${label}.${unknown}`
    });
  }
}

function text(value, field, maximum = 2_000) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum) {
    fail("invalid_authoring_continuity", `${field} é inválido.`, { field });
  }
  return normalized;
}

function optionalText(value, field, maximum = 2_000) {
  if (value == null) return null;
  return text(value, field, maximum);
}

function identifier(value, field) {
  return text(value, field, 240);
}

function uuid(value, field) {
  const result = identifier(value, field);
  if (!UUID_PATTERN.test(result)) {
    fail("invalid_authoring_continuity", `${field} deve ser UUID.`, { field });
  }
  return result;
}

function positiveRevision(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    fail("invalid_authoring_continuity", `${field} deve ser uma revisão positiva.`, {
      field
    });
  }
  return value;
}

function uniqueIds(value, field, maximum = 500) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    fail(
      "invalid_authoring_continuity",
      `${field} deve conter de 1 a ${maximum} identificadores.`,
      { field }
    );
  }
  const result = value.map((item, index) => identifier(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail("invalid_authoring_continuity", `${field} não aceita repetições.`, { field });
  }
  return result;
}

function normalizePart(value, field = "part") {
  if (!plainObject(value)) {
    fail("invalid_authoring_continuity", `${field} deve ser um objeto.`, { field });
  }
  only(value, ["id", "title", "microsequenceIds"], field);
  return {
    id: identifier(value.id, `${field}.id`),
    title: text(value.title, `${field}.title`, 300),
    microsequenceIds: uniqueIds(
      value.microsequenceIds,
      `${field}.microsequenceIds`,
      500
    )
  };
}

function normalizeDecision(value, field = "decision") {
  if (!plainObject(value)) {
    fail("invalid_authoring_continuity", `${field} deve ser um objeto.`, { field });
  }
  only(value, ["id", "summary", "entityType", "entityId"], field);
  const entityType = optionalText(value.entityType, `${field}.entityType`, 30);
  const entityId = optionalText(value.entityId, `${field}.entityId`, 240);
  if ((entityType == null) !== (entityId == null)
      || (entityType && !DECISION_ENTITY_TYPES.has(entityType))) {
    fail(
      "invalid_authoring_continuity",
      `${field}.entityType e ${field}.entityId devem identificar juntos uma entidade.`,
      { field }
    );
  }
  return {
    id: identifier(value.id, `${field}.id`),
    summary: text(value.summary, `${field}.summary`, 1_000),
    ...(entityType ? { entityType, entityId } : {})
  };
}

function normalizeMandate(value, field = "mandate") {
  if (value == null) return null;
  if (!plainObject(value)) {
    fail("invalid_authoring_continuity", `${field} deve ser um objeto.`, { field });
  }
  only(value, [
    "id", "kind", "targetPartId", "findingIds", "note", "decidedAtRevision"
  ], field);
  const targetPartId = optionalText(value.targetPartId, `${field}.targetPartId`, 240);
  const findingIds = value.findingIds == null
    ? []
    : uniqueIds(
      value.findingIds,
      `${field}.findingIds`,
      CONTINUITY_MANDATE_FINDING_MAX_ITEMS
    ).map(
      (findingId, index) => uuid(findingId, `${field}.findingIds[${index}]`)
    );
  const note = optionalText(value.note, `${field}.note`, 2_000);
  const kind = text(value.kind, `${field}.kind`, 80);
  if (!MANDATE_KINDS.has(kind)) {
    fail("invalid_authoring_continuity", `${field}.kind é inválido.`, {
      field: `${field}.kind`
    });
  }
  if (kind === "build_part" && !targetPartId) {
    fail("invalid_authoring_continuity", `${field}.targetPartId é obrigatório.`);
  }
  if (kind === "repair_findings" && findingIds.length === 0) {
    fail("invalid_authoring_continuity", `${field}.findingIds é obrigatório.`);
  }
  if (kind === "build_part" && findingIds.length > 0) {
    fail("invalid_authoring_continuity", `${field}.findingIds não pertence a build_part.`);
  }
  if (kind === "repair_findings" && targetPartId) {
    fail("invalid_authoring_continuity", `${field}.targetPartId não pertence a repair_findings.`);
  }
  if (new Set(["audit", "restructure"]).has(kind)
      && findingIds.length > 0) {
    fail("invalid_authoring_continuity", `${field} contém alvo incompatível com ${kind}.`);
  }
  return {
    id: identifier(value.id, `${field}.id`),
    kind,
    ...(targetPartId ? { targetPartId } : {}),
    ...(findingIds.length ? { findingIds } : {}),
    ...(note ? { note } : {}),
    decidedAtRevision: positiveRevision(
      value.decidedAtRevision,
      `${field}.decidedAtRevision`
    )
  };
}

export function normalizeContinuityState(value) {
  const source = plainObject(value) ? value : {};
  only(source, ["version", "parts", "decisions", "mandate"], "state");
  const version = source.version == null
    ? WORKSPACE_CONTINUITY_VERSION
    : source.version;
  if (version !== WORKSPACE_CONTINUITY_VERSION) {
    fail("unsupported_authoring_continuity", "A versão da continuidade não é suportada.");
  }
  const parts = Array.isArray(source.parts)
    ? source.parts.map((part, index) => normalizePart(part, `state.parts[${index}]`))
    : [];
  const decisions = Array.isArray(source.decisions)
    ? source.decisions.map(
      (decision, index) => normalizeDecision(decision, `state.decisions[${index}]`)
    )
    : [];
  if (parts.length > CONTINUITY_PART_MAX_ITEMS
      || decisions.length > CONTINUITY_DECISION_MAX_ITEMS) {
    fail("authoring_continuity_too_large", "A continuidade contém itens demais.");
  }
  if (new Set(parts.map(({ id }) => id)).size !== parts.length) {
    fail("duplicate_authoring_part", "O plano contém ids de Parte repetidos.");
  }
  if (new Set(decisions.map(({ id }) => id)).size !== decisions.length) {
    fail("duplicate_authoring_decision", "O contexto contém decisões repetidas.");
  }
  const assigned = new Map();
  parts.forEach((part) => part.microsequenceIds.forEach((microsequenceId) => {
    const previous = assigned.get(microsequenceId);
    if (previous) {
      fail(
        "overlapping_authoring_parts",
        `A microssequência ${microsequenceId} pertence às Partes ${previous} e ${part.id}.`,
        { microsequenceId, partIds: [previous, part.id] }
      );
    }
    assigned.set(microsequenceId, part.id);
  }));
  const result = {
    version,
    parts,
    decisions,
    mandate: normalizeMandate(source.mandate, "state.mandate")
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength
      > CONTINUITY_STATE_MAX_BYTES) {
    fail("authoring_continuity_too_large", "A continuidade ultrapassa 48 KiB.");
  }
  return result;
}

function rowIdentity(entityType, entityId) {
  return `${entityType}\u0000${entityId}`;
}

function normalizedRows(reference) {
  return Array.isArray(reference?.entities) ? reference.entities : [];
}

function entityIndex(reference) {
  return new Map(normalizedRows(reference).map((row) => [
    rowIdentity(row.entityType, row.entityId),
    row
  ]));
}

function entityPath(index, row) {
  const path = [row.entityId];
  let current = row;
  while (current.parentType && current.parentType !== "project") {
    current = index.get(rowIdentity(current.parentType, current.parentId));
    if (!current) return null;
    path.unshift(current.entityId);
  }
  return path;
}

function assertEntityExists(reference, entityType, entityId, field) {
  const row = entityIndex(reference).get(rowIdentity(entityType, entityId));
  if (!row) {
    fail("authoring_continuity_target_not_found", `${field} não existe no workspace.`, {
      field,
      entityType,
      entityId
    });
  }
  return row;
}

function assertEntityPath(reference, entityType, path, field) {
  const expectedDepth = ENTITY_DEPTH[entityType];
  if (!Object.hasOwn(ENTITY_DEPTH, entityType)
      || !Array.isArray(path)
      || path.length !== expectedDepth) {
    fail("invalid_authoring_continuity_target", `${field} é inválido.`, { field });
  }
  const normalized = path.map((entry, index) => identifier(entry, `${field}[${index}]`));
  if (entityType === "workspace") return normalized;
  const index = entityIndex(reference);
  const row = index.get(rowIdentity(entityType === "resource" ? "card" : entityType, normalized.at(-1)));
  const currentPath = row ? entityPath(index, row) : null;
  if (!currentPath || JSON.stringify(currentPath) !== JSON.stringify(normalized)) {
    fail("authoring_continuity_target_not_found", `${field} não existe no workspace.`, {
      field,
      entityType,
      entityPath: normalized
    });
  }
  return normalized;
}

function findingIdentifier(finding) {
  return finding?.findingId || null;
}

function activeFindings(continuity) {
  const raw = Array.isArray(continuity?.activeFindings)
    ? continuity.activeFindings
    : [];
  return raw.filter((finding) => finding?.deletedAt == null && finding?.status !== "deleted");
}

function findingIds(continuity) {
  return new Set(activeFindings(continuity).map(findingIdentifier).filter(Boolean));
}

function cardResourceTargetIds(card) {
  const targets = [];
  const append = (instance, slot) => {
    const instanceId = typeof instance?.id === "string" ? instance.id.trim() : "";
    if (instanceId) targets.push(`${slot}:${instanceId}`);
  };
  for (const instance of Array.isArray(card?.content) ? card.content : []) {
    append(instance, "content");
  }
  if (card?.response) append(card.response, "response");
  for (const instance of Array.isArray(card?.feedback) ? card.feedback : []) {
    append(instance, "feedback");
  }
  return new Set(targets);
}

function validatePartTargets(parts, reference) {
  for (const part of parts) {
    for (const microsequenceId of part.microsequenceIds) {
      assertEntityExists(
        reference,
        "microsequence",
        microsequenceId,
        `parts.${part.id}.microsequenceIds`
      );
    }
  }
}

function validateDecisionTargets(decisions, reference) {
  for (const decision of decisions) {
    if (decision.entityType) {
      assertEntityExists(
        reference,
        decision.entityType,
        decision.entityId,
        `decisions.${decision.id}`
      );
    }
  }
}

function validateMandateTargets(state, continuity, reference) {
  if (state.mandate?.targetPartId
      && !state.parts.some(({ id }) => id === state.mandate.targetPartId)) {
    fail("authoring_mandate_target_not_found", "A Parte do mandato não existe.", {
      partId: state.mandate.targetPartId
    });
  }
  const availableFindingIds = findingIds(continuity);
  for (const findingId of state.mandate?.findingIds || []) {
    if (!availableFindingIds.has(findingId)
        && !continuity?.activeFindingsTruncated) {
      fail("authoring_mandate_target_not_found", "Um achado do mandato não existe.", {
        findingId
      });
    }
  }
  if (state.mandate?.kind === "repair_findings") {
    const currentById = new Map(activeFindings(continuity).map((finding) => [
      findingIdentifier(finding), finding
    ]));
    for (const findingId of state.mandate.findingIds) {
      const current = currentById.get(findingId);
      if (current && current.status !== "approved") {
        fail(
          "authoring_mandate_finding_not_approved",
          "O mandato de reparo aceita somente achados aprovados.",
          { findingId }
        );
      }
      if (!current && !continuity?.activeFindingsTruncated) {
        fail("authoring_mandate_target_not_found", "Um achado do mandato não existe.", {
          findingId
        });
      }
    }
  }
  if (state.mandate?.kind === "build_part") {
    const targetPart = state.parts.find(({ id }) =>
      id === state.mandate.targetPartId);
    const rows = normalizedRows(reference);
    const currentEntityIndex = entityIndex(reference);
    const existingMicrosequenceIds = new Set(rows
      .filter(({ entityType }) => entityType === "microsequence")
      .map(({ entityId }) => entityId));
    const materializedMicrosequenceIds = new Set(rows
      .filter(({ entityType, parentType }) =>
        entityType === "card" && parentType === "microsequence")
      .map(({ parentId }) => parentId));
    if (targetPart?.microsequenceIds.every((microsequenceId) =>
      existingMicrosequenceIds.has(microsequenceId)
      && currentEntityIndex.get(
        rowIdentity("microsequence", microsequenceId)
      )?.content?.status === "ready"
      && materializedMicrosequenceIds.has(microsequenceId))) {
      fail(
        "authoring_mandate_part_already_materialized",
        "build_part exige uma Parte ainda não totalmente materializada; use repair ou restructure."
      );
    }
  }
}

export function applyContinuityStateOperation({
  state: rawState,
  operation,
  arguments: operationArguments,
  reference,
  continuity,
  expectedRevision
}) {
  if (!CONTINUITY_STATE_OPERATIONS.has(operation)) {
    fail("invalid_authoring_continuity_operation", "A operação de continuidade é inválida.");
  }
  const state = normalizeContinuityState(rawState);
  if (!plainObject(operationArguments)) {
    fail("invalid_authoring_continuity", "arguments deve ser um objeto.");
  }
  const next = structuredClone(state);
  if (operation === "record_approved_plan") {
    only(operationArguments, ["parts", "decisions", "mandate"], "arguments");
    if (!Array.isArray(operationArguments.parts)
        || operationArguments.parts.length < 1
        || operationArguments.parts.length > CONTINUITY_PART_MAX_ITEMS) {
      fail(
        "invalid_authoring_plan",
        `arguments.parts deve conter de 1 a ${CONTINUITY_PART_MAX_ITEMS} Partes.`
      );
    }
    next.parts = operationArguments.parts.map((part, index) =>
      normalizePart(part, `arguments.parts[${index}]`));
    if (!Array.isArray(operationArguments.decisions)
        || operationArguments.decisions.length < 1
        || operationArguments.decisions.length > CONTINUITY_DECISION_MAX_ITEMS) {
      fail(
        "invalid_authoring_plan",
        `arguments.decisions deve conter de 1 a ${CONTINUITY_DECISION_MAX_ITEMS} decisões.`
      );
    }
    next.decisions = operationArguments.decisions.map((decision, index) =>
      normalizeDecision(decision, `arguments.decisions[${index}]`));
    if (operationArguments.mandate == null) {
      next.mandate = null;
    } else {
      if (!plainObject(operationArguments.mandate)) {
        fail("invalid_authoring_plan", "arguments.mandate deve ser objeto ou null.");
      }
      only(operationArguments.mandate, [
        "id", "kind", "targetPartId", "findingIds", "note"
      ], "arguments.mandate");
      next.mandate = normalizeMandate({
        ...operationArguments.mandate,
        decidedAtRevision: expectedRevision
      }, "arguments.mandate");
    }
  } else if (operation === "define_part") {
    only(operationArguments, ["id", "title", "microsequenceIds"], "arguments");
    const part = normalizePart(operationArguments, "arguments");
    const existingIndex = next.parts.findIndex(({ id }) => id === part.id);
    if (existingIndex >= 0) next.parts[existingIndex] = part;
    else next.parts.push(part);
  } else if (operation === "remove_part") {
    only(operationArguments, ["partId"], "arguments");
    const partId = identifier(operationArguments.partId, "arguments.partId");
    if (!next.parts.some(({ id }) => id === partId)) {
      fail("authoring_part_not_found", "A Parte não existe.", { partId });
    }
    if (next.mandate?.targetPartId === partId) {
      fail(
        "authoring_part_in_use",
        "Limpe ou altere o mandato ativo antes de remover esta Parte.",
        { partId }
      );
    }
    next.parts = next.parts.filter(({ id }) => id !== partId);
  } else if (operation === "record_decision") {
    only(operationArguments, ["id", "summary", "entityType", "entityId"], "arguments");
    const decision = normalizeDecision(operationArguments, "arguments");
    const existingIndex = next.decisions.findIndex(({ id }) => id === decision.id);
    if (existingIndex >= 0) next.decisions[existingIndex] = decision;
    else next.decisions.push(decision);
  } else if (operation === "remove_decision") {
    only(operationArguments, ["decisionId"], "arguments");
    const decisionId = identifier(operationArguments.decisionId, "arguments.decisionId");
    if (!next.decisions.some(({ id }) => id === decisionId)) {
      fail("authoring_decision_not_found", "A decisão não existe.", { decisionId });
    }
    next.decisions = next.decisions.filter(({ id }) => id !== decisionId);
  } else if (operation === "set_mandate") {
    only(operationArguments, [
      "id", "kind", "targetPartId", "findingIds", "note"
    ], "arguments");
    next.mandate = normalizeMandate({
      ...operationArguments,
      decidedAtRevision: expectedRevision
    }, "arguments");
  } else {
    only(operationArguments, [], "arguments");
    next.mandate = null;
  }
  const normalized = normalizeContinuityState(next);
  if (operation === "record_approved_plan") {
    validatePartTargets(normalized.parts, reference);
    validateDecisionTargets(normalized.decisions, reference);
    validateMandateTargets(normalized, continuity, reference);
  } else if (operation === "define_part") {
    validatePartTargets(
      normalized.parts.filter(({ id }) => id === operationArguments.id),
      reference
    );
  } else if (operation === "record_decision") {
    validateDecisionTargets(
      normalized.decisions.filter(({ id }) => id === operationArguments.id),
      reference
    );
  } else if (operation === "set_mandate") {
    validateMandateTargets(normalized, continuity, reference);
  }
  return normalized;
}

export function validateFindingOperation({
  operation,
  arguments: rawArguments,
  reference
}) {
  if (!CONTINUITY_FINDING_OPERATIONS.has(operation)) {
    fail("invalid_authoring_finding_operation", "A operação de achado é inválida.");
  }
  const value = plainObject(rawArguments) ? rawArguments : {};
  if (operation === "record_finding") {
    only(value, [
      "entityType", "entityPath", "resourceTargetId", "category", "severity",
      "summary", "proposedRepair"
    ], "arguments");
    const entityType = text(value.entityType, "arguments.entityType", 30);
    if (!Object.hasOwn(ENTITY_DEPTH, entityType)) {
      fail("invalid_authoring_finding", "arguments.entityType é inválido.");
    }
    const entityPathValue = assertEntityPath(
      reference,
      entityType,
      value.entityPath,
      "arguments.entityPath"
    );
    const severity = text(value.severity, "arguments.severity", 20);
    if (!FINDING_SEVERITIES.has(severity)) {
      fail("invalid_authoring_finding", "arguments.severity é inválido.");
    }
    const resourceTargetId = optionalText(
      value.resourceTargetId,
      "arguments.resourceTargetId",
      240
    );
    if ((entityType === "resource") !== (resourceTargetId != null)) {
      fail("invalid_authoring_finding", "arguments.resourceTargetId é inválido.");
    }
    if (entityType === "resource") {
      const cardId = entityPathValue.at(-1);
      const card = entityIndex(reference).get(rowIdentity("card", cardId));
      if (!card || !cardResourceTargetIds(card.content).has(resourceTargetId)) {
        fail(
          "authoring_finding_resource_not_found",
          "arguments.resourceTargetId não existe no card atual.",
          { resourceTargetId, cardId }
        );
      }
    }
    return {
      entityType,
      entityPath: entityPathValue,
      ...(resourceTargetId ? { resourceTargetId } : {}),
      category: text(value.category, "arguments.category", 64),
      severity,
      summary: text(value.summary, "arguments.summary", 1_000),
      proposedRepair: text(value.proposedRepair, "arguments.proposedRepair", 1_000)
    };
  }
  const observationId = identifier(value.observationId, "arguments.observationId");
  if (operation === "decide_finding") {
    only(value, ["observationId", "decision"], "arguments");
    const decision = text(value.decision, "arguments.decision", 20);
    if (!new Set(["approved", "rejected"]).has(decision)) {
      fail("invalid_authoring_finding_decision", "arguments.decision é inválido.");
    }
    return { observationId, decision };
  }
  if (operation === "link_finding_correction") {
    only(value, ["observationId", "correctionRequestId"], "arguments");
    const correctionRequestId = identifier(
      value.correctionRequestId,
      "arguments.correctionRequestId"
    );
    if (!REQUEST_ID_PATTERN.test(correctionRequestId)) {
      fail(
        "invalid_authoring_finding_correction",
        "arguments.correctionRequestId é inválido."
      );
    }
    return {
      observationId,
      correctionRequestId
    };
  }
  if (operation === "verify_finding") {
    only(value, ["observationId", "outcome", "note"], "arguments");
    const outcome = text(value.outcome, "arguments.outcome", 20);
    if (!new Set(["resolved", "still_open"]).has(outcome)) {
      fail("invalid_authoring_finding_verification", "arguments.outcome é inválido.");
    }
    const note = text(value.note, "arguments.note", 1_000);
    return {
      observationId,
      outcome,
      note
    };
  }
  only(value, ["observationId"], "arguments");
  return { observationId };
}

function normalizedFinding(value) {
  const observationId = findingIdentifier(value);
  if (!observationId) return null;
  const status = FINDING_STATUSES.has(value.status) ? value.status : "open";
  const currentEntityPath = Array.isArray(value.currentEntityPath)
    ? value.currentEntityPath
    : null;
  const targetAvailable = Boolean(value.targetAvailable);
  return {
    observationId,
    entityType: value.entityType,
    entityPath: targetAvailable && currentEntityPath
      ? currentEntityPath
      : Array.isArray(value.entityPath) ? value.entityPath : [],
    currentEntityPath,
    targetAvailable,
    resourceTargetId: value.resourceTargetId ?? null,
    category: value.category || "",
    severity: value.severity || "medium",
    status,
    summary: String(value.summary || value.body || ""),
    proposedRepair: String(value.proposedRepair || ""),
    auditRevision: value.auditRevision || 1,
    pendingCorrectionRequestId: value.pendingCorrectionRequestId ?? null,
    pendingRevision: value.pendingRevision ?? null,
    resultingRevision: value.resultingRevision ?? null,
    createdAt: value.createdAt || value.updatedAt || null,
    updatedAt: value.updatedAt || null
  };
}

function outlineCounts(rows, parts) {
  const count = (entityType) => rows.filter((row) =>
    row.entityType === entityType).length;
  const assignedMicrosequenceIds = new Set(parts.flatMap((part) =>
    part.microsequenceIds));
  return {
    courseCount: count("course"),
    moduleCount: count("module"),
    lessonCount: count("lesson"),
    microsequenceCount: count("microsequence"),
    cardCount: count("card"),
    unassignedMicrosequenceCount: rows.filter((row) =>
      row.entityType === "microsequence"
      && !assignedMicrosequenceIds.has(row.entityId)).length
  };
}

function utf8Size(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function actionEnvelopeUtf8Size(data) {
  return utf8Size({ ok: true, requestId: null, data });
}

function observationSummary(value) {
  if (!plainObject(value)) {
    return { totalCount: 0, openCount: 0, focus: [] };
  }
  return {
    totalCount: Number.isInteger(value.totalCount) ? value.totalCount : 0,
    openCount: Number.isInteger(value.openCount) ? value.openCount : 0,
    focus: Array.isArray(value.focus)
      ? value.focus
      : Array.isArray(value.focusCards)
        ? value.focusCards
        : []
  };
}

export function buildWorkspaceResumeProjection(reference, rawContinuity) {
  const continuity = plainObject(rawContinuity) ? rawContinuity : {};
  if (!plainObject(continuity.authoringState)) {
    throw new AuthoringApiError(
      502,
      "invalid_authoring_continuity_response",
      "O backend não devolveu o estado de continuidade autoral."
    );
  }
  const state = normalizeContinuityState(continuity.authoringState);
  const rows = normalizedRows(reference);
  const index = entityIndex(reference);
  const cardsByMicrosequence = new Map();
  rows.filter(({ entityType }) => entityType === "card").forEach((card) => {
    cardsByMicrosequence.set(
      card.parentId,
      (cardsByMicrosequence.get(card.parentId) || 0) + 1
    );
  });
  const parts = state.parts.map((part) => {
    const resolved = part.microsequenceIds.map((microsequenceId) => {
      const row = index.get(rowIdentity("microsequence", microsequenceId));
      if (!row) return null;
      const path = entityPath(index, row);
      const cardCount = cardsByMicrosequence.get(microsequenceId) || 0;
      return path ? {
        id: microsequenceId,
        entityPath: path,
        cardCount,
        status: row.content?.status || null
      } : null;
    });
    const available = resolved.filter(Boolean);
    return {
      id: part.id,
      title: part.title,
      microsequenceIds: part.microsequenceIds,
      microsequenceStateMask: resolved.map((item) =>
        item == null
          ? "x"
          : item.cardCount === 0
            ? "p"
            : item.status === "ready" ? "r" : "m").join(""),
      microsequenceCount: part.microsequenceIds.length,
      materializedCount: available.filter(({ cardCount }) => cardCount > 0).length,
      readyCount: available.filter(({ cardCount, status }) =>
        cardCount > 0 && status === "ready").length,
      cardCount: available.reduce((total, item) => total + item.cardCount, 0),
      missingCount: part.microsequenceIds.filter((id) =>
        !index.has(rowIdentity("microsequence", id))).length
    };
  });
  const decisions = state.decisions.map((decision) => {
    if (!decision.entityType) {
      return {
        ...decision,
        targetAvailable: true
      };
    }
    const row = index.get(rowIdentity(decision.entityType, decision.entityId));
    return {
      ...decision,
      targetAvailable: Boolean(row && entityPath(index, row))
    };
  });
  const normalizedActiveFindings = activeFindings(continuity)
    .map(normalizedFinding)
    .filter(Boolean);
  const activeFindingStatuses = new Set(["open", "approved", "repaired"]);
  const allFindings = normalizedActiveFindings.filter(({ status }) =>
    activeFindingStatuses.has(status));
  const findings = allFindings.slice(0, 10);
  const rawFindingSummary = plainObject(continuity.findingSummary)
    ? continuity.findingSummary
    : {};
  const rawByStatus = plainObject(rawFindingSummary.byStatus)
    ? rawFindingSummary.byStatus
    : {};
  const byStatus = Object.fromEntries([...FINDING_STATUSES].map((status) => [
    status,
    Number.isInteger(rawByStatus[status])
      ? rawByStatus[status]
      : normalizedActiveFindings.filter((finding) => finding.status === status).length
  ]));
  const findingSummary = {
    totalCount: Number.isInteger(rawFindingSummary.total)
      ? rawFindingSummary.total
      : Object.values(byStatus).reduce((total, count) => total + count, 0),
    activeCount: Number.isInteger(rawFindingSummary.active)
      ? rawFindingSummary.active
      : findings.length,
    byStatus
  };
  const structural = observationSummary(
    continuity.structuralObservations
  );
  const situated = observationSummary(
    continuity.situatedObservations
  );
  const control = { ...reference };
  delete control.entities;
  delete control.publications;
  const rawPublications = Array.isArray(reference?.publications)
    ? reference.publications
    : [];
  const result = {
    ...control,
    brief: String(reference?.brief || ""),
    view: "resume",
    content: {
      outline: outlineCounts(rows, state.parts),
      parts,
      decisions,
      mandate: state.mandate,
      findings: {
        items: findings,
        summary: findingSummary,
        truncated: Boolean(continuity.activeFindingsTruncated)
          || allFindings.length > 10
      },
      observations: { structural, situated },
      publications: {
        items: rawPublications.slice(0, 10),
        totalCount: rawPublications.length,
        truncated: rawPublications.length > 10
      }
    }
  };
  if (utf8Size(result) > RESUME_SOFT_BUDGET_BYTES
      && result.content.findings.items.length > 0) {
    result.content.findings.items = [];
    result.content.findings.truncated = true;
  }
  if (utf8Size(result) > RESUME_SOFT_BUDGET_BYTES
      && result.content.publications.items.length > 0) {
    result.content.publications.items = [];
    result.content.publications.truncated = true;
  }
  if (utf8Size(result) > RESUME_SOFT_BUDGET_BYTES) {
    result.content.observations.structural.focus = [];
    result.content.observations.situated.focus = [];
  }
  if (actionEnvelopeUtf8Size(result) >= ACTION_RESPONSE_LIMIT_BYTES) {
    throw new AuthoringApiError(
      413,
      "authoring_resume_too_large",
      "A continuidade excede o limite seguro de resposta. Reduza o brief ou o plano."
    );
  }
  return result;
}
