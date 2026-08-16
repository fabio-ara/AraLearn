import {
  diffExperimentVariantMaterializations,
  EXPERIMENT_FACTUAL_DIFF_ALGORITHM_REF,
  normalizeExperimentDifferenceClassifications,
  normalizeInstructionalExperimentProtocol
} from "../aralearn/runtime/authoring/instructionalExperiment.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const ACTION_CONTRACT = "aralearn.instructional-experiment-action.v1";
const ENROLLMENT_CONTRACT = "aralearn.instructional-experiment-enrollment.v1";
const DESIGN_SLICE_CONTRACT = "aralearn.authoring-design-slice.v1";
const RESPONSE_LIMIT_BYTES = 90 * 1024;
const EVIDENCE_PAGE_CALL_MAX = 40;
const EVIDENCE_DEADLINE_RESERVE_MS = 10_000;
const OPTION_LIMITS = Object.freeze({
  scope: 20,
  base: 20,
  factor_definition: 1,
  resource_set: 20,
  consent_policy: 20,
  instrument: 20,
  outcome: 20
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function ref(value, field = "reference") {
  const id = text(value?.id);
  const version = text(value?.version);
  if (!id || !version) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_backend_result",
      `${field} não contém uma referência versionada.`
    );
  }
  return { id, version };
}

function refKey(value) {
  return `${text(value?.id)}@${text(value?.version)}`;
}

function exactObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringApiError(422, "invalid_experiment_evidence_request", `${label} é inválido.`);
  }
  const allowed = new Set(fields);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length || missing.length) {
    throw new AuthoringApiError(
      422,
      "invalid_experiment_evidence_request",
      `${label} precisa ser fechado e conter somente referências exatas.`,
      { unknown, missing }
    );
  }
  return value;
}

function requireMethod(adapter, method) {
  if (typeof adapter?.[method] !== "function") {
    throw new AuthoringApiError(
      500,
      "experiment_backend_unavailable",
      `O backend não oferece ${method}.`
    );
  }
  return adapter[method].bind(adapter);
}

function responseBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedResponse(value) {
  const bytes = responseBytes(value);
  if (bytes > RESPONSE_LIMIT_BYTES) {
    throw new AuthoringApiError(
      500,
      "experiment_response_budget_exceeded",
      "A projeção experimental excedeu o envelope progressivo seguro.",
      { bytes, maximumBytes: RESPONSE_LIMIT_BYTES }
    );
  }
  return value;
}

function page(raw, maximum) {
  const items = list(raw?.items).slice(0, maximum);
  const count = Number.isInteger(raw?.count) ? raw.count : items.length;
  const nextCursor = text(raw?.nextCursor) || null;
  return {
    items,
    count,
    nextCursor,
    truncated: Boolean(raw?.truncated || nextCursor || count > items.length)
  };
}

function backendPaged(raw) {
  return raw != null
    && !Array.isArray(raw)
    && (
      Object.prototype.hasOwnProperty.call(raw, "nextCursor")
      || Object.prototype.hasOwnProperty.call(raw, "truncated")
      || Object.prototype.hasOwnProperty.call(raw, "count")
    );
}

function localPinnedPage(raw, limit, cursor, prefix, code, message) {
  const allItems = list(raw?.items);
  let offset = 0;
  if (cursor != null) {
    const match = new RegExp(`^${prefix}:([0-9]{1,6})$`, "u").exec(cursor);
    offset = match ? Number(match[1]) : -1;
    if (offset < 0 || offset > allItems.length) {
      throw new AuthoringApiError(
        422,
        code,
        message
      );
    }
  }
  const items = allItems.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    count: allItems.length,
    nextCursor: nextOffset < allItems.length ? `${prefix}:${nextOffset}` : null,
    truncated: nextOffset < allItems.length
  };
}

function experimentState(raw) {
  return text(raw?.state || raw?.status);
}

function experimentRevision(raw) {
  return raw?.experimentRevision ?? raw?.revision;
}

function assignmentRead(raw) {
  const assignment = raw?.assignment || raw || {};
  return {
    rule: text(assignment.rule),
    seedConfigured: Boolean(
      assignment.seedConfigured
      ?? assignment.seedCommitment
      ?? assignment.commitment
      ?? assignment.seed
    ),
    algorithm: text(assignment.algorithm) || null,
    commitment: text(assignment.commitment || assignment.seedCommitment) || null
  };
}

function protocolRead(raw) {
  return {
    title: text(raw?.title),
    hypothesis: text(raw?.hypothesis) || null,
    baseRef: ref(raw?.baseRef, "protocol.baseRef"),
    scope: {
      kind: text(raw?.scope?.kind),
      ref: text(raw?.scope?.ref)
    },
    factors: list(raw?.factors).slice(0, 8).map((factor) => ({
      factorId: text(factor?.factorId),
      definitionRef: ref(factor?.definitionRef, "protocol.factor.definitionRef"),
      kind: text(factor?.kind),
      targets: list(factor?.targets).slice(0, 500).map((target) => ({
        kind: text(target?.kind),
        ref: text(target?.ref)
      }))
    })),
    conditions: list(raw?.conditions).slice(0, 32).map((condition) => ({
      conditionId: text(condition?.conditionId),
      conditionRef: condition?.conditionRef
        ? ref(condition.conditionRef, "protocol.condition.conditionRef")
        : null,
      label: text(condition?.label),
      values: list(condition?.values).slice(0, 8).map((value) => (
        value?.resourceSetRef
          ? {
              factorId: text(value?.factorId),
              resourceSetRef: ref(value.resourceSetRef, "protocol.condition.resourceSetRef")
            }
          : { factorId: text(value?.factorId), value: clone(value?.value) }
      ))
    })),
    invariants: list(raw?.invariants).slice(0, 4).map(text),
    assignment: assignmentRead(raw),
    consentPolicyRef: ref(raw?.consentPolicyRef, "protocol.consentPolicyRef"),
    instrumentRefs: list(raw?.instrumentRefs).map((value) => ref(value, "instrumentRef")),
    outcomeRefs: list(raw?.outcomeRefs).map((value) => ref(value, "outcomeRef"))
  };
}

function actionsRead(raw) {
  const actions = raw || {};
  const transitions = [...new Set(list(
    Array.isArray(actions.transitionCollection)
      ? actions.transitionCollection
      : actions.transitions
  ).map(text).filter((value) => (
    ["pause", "resume", "close", "invalidate"].includes(value)
  )))];
  return {
    saveProtocol: actions.saveProtocol === true,
    validate: actions.validate === true,
    generateVariants: actions.generateVariants === true,
    decideDifference: actions.decideDifference === true,
    requestCorrection: actions.requestCorrection === true,
    freeze: actions.freeze === true,
    startCollection: actions.startCollection === true,
    rotateEnrollmentCode: actions.rotateEnrollmentCode === true,
    transitionCollection: transitions,
    assignParticipant: actions.assignParticipant === true
  };
}

function authoringReaderTarget(raw) {
  if (!raw) return null;
  return {
    workspaceId: text(raw.workspaceId),
    entityPath: list(raw.entityPath).slice(0, 4).map(text),
    courseId: text(raw.courseId),
    access: "private",
    contentHash: text(raw.contentHash) || null
  };
}

function resourceSummary(raw) {
  const source = Array.isArray(raw)
    ? { items: raw, count: raw.length, truncated: raw.length > 2 }
    : raw || {};
  const result = page(source, 2);
  return {
    ...result,
    items: result.items.map((item) => ({
      ref: ref(item?.ref || item, "resourceSummary.ref"),
      label: text(item?.label || item?.title).slice(0, 300),
      role: text(item?.role).slice(0, 80)
    }))
  };
}

function variantRead(raw) {
  const provenance = raw?.provenance || raw?.evidence || raw || {};
  const nullableRef = (value, field) => value ? ref(value, field) : null;
  return {
    variantRevisionRef: ref(raw?.variantRevisionRef, "variantRevisionRef"),
    conditionRef: ref(raw?.conditionRef, "conditionRef"),
    baseRef: ref(raw?.baseRef || provenance?.baseRef, "variant.baseRef"),
    protocolRef: ref(raw?.protocolRef || provenance?.protocolRef, "variant.protocolRef"),
    state: text(raw?.state || raw?.status),
    workspaceRevision: raw?.workspaceRevision ?? raw?.readerTarget?.workspaceRevision,
    readerTarget: authoringReaderTarget(raw?.readerTarget),
    frozenAt: text(raw?.frozenAt) || null,
    limitationRefs: list(raw?.limitationRefs).slice(0, 16).map((value) => ref(value)),
    snapshotRef: nullableRef(
      raw?.snapshotRef || provenance?.snapshotRef,
      "variant.snapshotRef"
    ),
    materializationRef: nullableRef(
      raw?.materializationRef || provenance?.materializationRef,
      "variant.materializationRef"
    ),
    auditRunRef: nullableRef(
      raw?.auditRunRef || provenance?.auditRunRef,
      "variant.auditRunRef"
    ),
    provenanceHash: text(raw?.provenanceHash || provenance?.hash) || null,
    provenancePinCount: Number.isInteger(
      raw?.provenancePinCount ?? provenance?.pinCount
    ) ? Math.max(0, raw?.provenancePinCount ?? provenance?.pinCount) : 0,
    currentness: {
      base: provenance?.currentness?.base === true,
      protocol: provenance?.currentness?.protocol === true,
      condition: provenance?.currentness?.condition === true,
      materialization: provenance?.currentness?.materialization === true,
      audit: provenance?.currentness?.audit === true
    },
    allowedResources: resourceSummary(raw?.allowedResources),
    materializedResources: resourceSummary(raw?.materializedResources)
  };
}

function differenceRunRead(raw) {
  const baselineKind = text(raw?.baselineRef?.kind);
  return {
    differenceRef: ref(raw?.differenceRef, "differenceRef"),
    baselineRef: {
      kind: baselineKind === "variant" ? "variant_revision" : baselineKind,
      ref: ref(raw?.baselineRef?.ref, "baselineRef.ref")
    },
    candidateVariantRevisionRef: ref(
      raw?.candidateVariantRevisionRef,
      "candidateVariantRevisionRef"
    ),
    state: text(raw?.state || raw?.status),
    hunkCount: Number(raw?.hunkCount) || 0,
    classifiedCount: Number(raw?.classifiedCount) || 0,
    decision: text(raw?.decision) || null,
    requiresParticipantContinuity: raw?.requiresParticipantContinuity === true
  };
}

function positiveBackendRevision(value, field) {
  const revision = typeof value === "string" && /^[1-9][0-9]*$/u.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_backend_result",
      `${field} não contém uma revisão positiva.`
    );
  }
  return revision;
}

function differenceHunkRead(raw) {
  return {
    differenceRef: ref(raw?.differenceRef, "differenceRef"),
    differenceId: text(raw?.differenceId),
    path: text(raw?.path),
    kind: text(raw?.kind),
    beforeSummary: raw?.beforeSummary == null ? null : String(raw.beforeSummary).slice(0, 500),
    afterSummary: raw?.afterSummary == null ? null : String(raw.afterSummary).slice(0, 500),
    classification: text(raw?.classification) || null,
    publicRationale: raw?.publicRationale == null
      ? null
      : String(raw.publicRationale).slice(0, 500),
    evidenceRefs: list(raw?.evidenceRefs).slice(0, 4).map(text),
    humanDecision: text(raw?.humanDecision || raw?.decision) || null,
    requiresParticipantContinuity: raw?.requiresParticipantContinuity === true
  };
}

function overviewExperiment(raw) {
  return {
    id: text(raw?.id || raw?.experimentId),
    experimentRevision: experimentRevision(raw),
    state: experimentState(raw),
    section: "overview",
    title: text(raw?.title || raw?.protocol?.title),
    hypothesis: text(raw?.hypothesis || raw?.protocol?.hypothesis) || null,
    actions: actionsRead(raw?.actions),
    assignment: assignmentRead(raw?.assignment || raw?.protocol),
    enrollment: {
      configured: raw?.enrollment?.configured === true,
      expiresAt: text(raw?.enrollment?.expiresAt) || null
    },
    conditionCount: Number(raw?.conditionCount) || 0,
    variantCount: Number(raw?.variantCount) || 0,
    differenceCount: Number(raw?.differenceCount) || 0
  };
}

function sectionExperiment(raw, options) {
  const base = {
    id: text(raw?.id || raw?.experimentId),
    experimentRevision: experimentRevision(raw),
    state: experimentState(raw),
    section: options.section
  };
  if (options.section === "overview") return overviewExperiment(raw);
  if (options.section === "protocol") {
    const protocolSource = raw?.protocol || raw;
    const protocolRefValue = raw?.protocolRef || protocolSource?.protocolRef;
    const protocolRevision = positiveBackendRevision(
      raw?.protocolRevision
        ?? protocolSource?.protocolRevision
        ?? protocolRefValue?.version,
      "protocolRevision"
    );
    if (options.protocolRevision != null
        && options.protocolRevision !== protocolRevision) {
      throw new AuthoringApiError(
        409,
        "experiment_protocol_revision_changed",
        "A revisão de protocolo devolvida não corresponde à revisão solicitada."
      );
    }
    return {
      ...base,
      protocolRef: ref(protocolRefValue, "protocolRef"),
      protocolRevision,
      protocol: protocolRead(protocolSource)
    };
  }
  if (options.section === "variants") {
    const source = Array.isArray(raw?.variants)
      ? { items: raw.variants }
      : raw?.variants || raw?.page || raw;
    const variantLimit = Math.min(options.variantLimit || 10, 10);
    const variants = backendPaged(source)
      ? page(source, variantLimit)
      : localPinnedPage(
          source,
          variantLimit,
          options.variantCursor || null,
          "v",
          "invalid_experiment_variant_cursor",
          "variantCursor não pertence ao conjunto pinado."
        );
    const setRef = ref(
      raw?.variantSetRef || source?.variantSetRef,
      "variantSetRef"
    );
    if (options.variantSetRef && refKey(options.variantSetRef) !== refKey(setRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_variant_page_changed",
        "O conjunto de variantes mudou durante a paginação."
      );
    }
    return {
      ...base,
      variantSetRef: setRef,
      ...variants,
      items: variants.items.map(variantRead)
    };
  }
  if (options.section === "participants") {
    const source = Array.isArray(raw?.participants)
      ? { items: raw.participants }
      : raw?.participants || raw?.page || raw;
    const participantLimit = Math.min(options.participantLimit || 20, 20);
    const participants = backendPaged(source)
      ? page(source, participantLimit)
      : localPinnedPage(
          source,
          participantLimit,
          options.participantCursor || null,
          "p",
          "invalid_experiment_participant_cursor",
          "participantCursor não pertence ao conjunto pinado."
        );
    const setRef = ref(
      raw?.participantSetRef || source?.participantSetRef,
      "participantSetRef"
    );
    if (options.participantSetRef && refKey(options.participantSetRef) !== refKey(setRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_participant_page_changed",
        "A fila pseudônima mudou durante a paginação."
      );
    }
    return {
      ...base,
      participantSetRef: setRef,
      ...participants,
      items: participants.items.map((participant) => ({
        enrollmentRef: text(participant?.enrollmentRef),
        pseudonymLabel: text(participant?.pseudonymLabel),
        status: text(participant?.status),
        assignedConditionRef: participant?.assignedConditionRef
          ? ref(participant.assignedConditionRef)
          : null
      }))
    };
  }
  const mode = options.differenceRunRef ? "hunks" : "runs";
  const differenceSource = mode === "hunks"
    ? raw?.hunks ?? raw?.differences ?? raw?.page ?? raw
    : raw?.differenceRuns ?? raw?.differences ?? raw?.page ?? raw;
  const source = Array.isArray(differenceSource)
    ? { items: differenceSource }
    : differenceSource;
  if (mode === "hunks") {
    const differenceLimit = Math.min(options.differenceLimit || 20, 20);
    const differences = backendPaged(source)
      ? page(source, differenceLimit)
      : localPinnedPage(
          source,
          differenceLimit,
          options.differenceCursor || null,
          "h",
          "invalid_experiment_difference_cursor",
          "differenceCursor não pertence à rodada factual pinada."
        );
    const returnedRunRef = source?.differenceRunRef || raw?.differenceRunRef || null;
    if (refKey(options.differenceRunRef) !== refKey(returnedRunRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_difference_page_changed",
        "A rodada factual do diff mudou durante a paginação."
      );
    }
    return {
      ...base,
      mode,
      differenceSetRef: null,
      differenceRunRef: ref(returnedRunRef, "differenceRunRef"),
      ...differences,
      items: differences.items.map(differenceHunkRead)
    };
  }
  const differenceRunLimit = Math.min(options.differenceRunLimit || 20, 20);
  const differences = backendPaged(source)
    ? page(source, differenceRunLimit)
    : localPinnedPage(
        source,
        differenceRunLimit,
        options.differenceRunCursor || null,
        "d",
        "invalid_experiment_difference_run_cursor",
        "differenceRunCursor não pertence ao conjunto pinado."
      );
  const differenceSetRef = ref(
    raw?.differenceSetRef || source?.differenceSetRef,
    "differenceSetRef"
  );
  if (options.differenceSetRef
      && refKey(options.differenceSetRef) !== refKey(differenceSetRef)) {
    throw new AuthoringApiError(
      409,
      "experiment_difference_set_changed",
      "O conjunto de rodadas factuais mudou durante a paginação."
    );
  }
  return {
    ...base,
    mode,
    differenceSetRef,
    differenceRunRef: null,
    ...differences,
    items: differences.items.map(differenceRunRead)
  };
}

function optionItem(kind, raw) {
  if (kind === "scope") {
    return {
      scope: { kind: text(raw?.scope?.kind), ref: text(raw?.scope?.ref) },
      label: text(raw?.label).slice(0, 300),
      entityPath: list(raw?.entityPath).slice(0, 4).map(text)
    };
  }
  if (kind === "factor_definition") {
    const sourceConstraints = raw?.constraints || {};
    const numberConstraint = (value) => (
      typeof value === "number" && Number.isFinite(value) ? value : null
    );
    const stringConstraintList = (value, maximum) => (
      [...new Set(list(value).map((item) => text(item).slice(0, 240)).filter(Boolean))]
        .slice(0, maximum)
    );
    const constraints = {};
    const minimum = numberConstraint(
      sourceConstraints.minimum ?? raw?.integerMinimum
    );
    const maximum = numberConstraint(
      sourceConstraints.maximum ?? raw?.integerMaximum
    );
    if (minimum != null) constraints.minimum = minimum;
    if (maximum != null) constraints.maximum = maximum;
    for (const [field, maximumItems] of [
      ["allowedEnumValues", 32],
      ["vectorDimensions", 32],
      ["allowedUnits", 16],
      ["relationKinds", 16]
    ]) {
      const values = stringConstraintList(sourceConstraints[field], maximumItems);
      if (values.length) constraints[field] = values;
    }
    const setItemPattern = text(sourceConstraints.setItemPattern);
    if (setItemPattern) constraints.setItemPattern = setItemPattern.slice(0, 240);
    const refNamespace = text(sourceConstraints.refNamespace);
    if (refNamespace) constraints.refNamespace = refNamespace.slice(0, 240);
    const unitSource = raw?.unit && typeof raw.unit === "object"
      ? raw.unit
      : null;
    const numerator = text(unitSource?.numerator || raw?.numerator);
    const denominator = text(unitSource?.denominator || raw?.denominator);
    return {
      definitionRef: ref(raw?.definitionRef || raw, "definitionRef"),
      label: text(raw?.label).slice(0, 300),
      kind: text(raw?.kind),
      valueType: text(raw?.valueType),
      unit: numerator && denominator ? { numerator, denominator } : null,
      supportedScopes: stringConstraintList(raw?.supportedScopes, 3).filter((scope) => (
        ["course", "lesson", "microsequence"].includes(scope)
      )),
      constraints,
      options: list(raw?.options).slice(0, 8).flatMap((option) => {
        const value = clone(option?.value);
        if (value == null || responseBytes(value) > 4 * 1024) return [];
        return [{
          label: text(option?.label).slice(0, 300),
          value
        }];
      })
    };
  }
  if (kind === "base") {
    return {
      ref: ref(raw?.ref || raw, "base.ref"),
      label: text(raw?.label).slice(0, 300),
      approved: raw?.approved === true,
      scope: {
        kind: text(raw?.scope?.kind),
        ref: text(raw?.scope?.ref)
      }
    };
  }
  if (kind === "resource_set") {
    return {
      ref: ref(raw?.ref || raw, "resource_set.ref"),
      label: text(raw?.label).slice(0, 300),
      memberCount: Number.isInteger(raw?.memberCount) && raw.memberCount >= 0
        ? raw.memberCount
        : 0,
      scope: {
        kind: text(raw?.scope?.kind),
        ref: text(raw?.scope?.ref)
      }
    };
  }
  return {
    ref: ref(raw?.ref || raw, `${kind}.ref`),
    label: text(raw?.label).slice(0, 300)
  };
}

function normalizedProtocol(protocol) {
  try {
    return normalizeInstructionalExperimentProtocol(protocol, {
      requireResourceSets: false
    });
  } catch (cause) {
    throw new AuthoringApiError(
      422,
      "invalid_instructional_experiment_protocol",
      cause instanceof Error ? cause.message : "O protocolo experimental é inválido.",
      { errors: list(cause?.errors).slice(0, 50) }
    );
  }
}

function mutationResult(workspaceId, operation, raw) {
  const specificRef = raw?.resultRef
    || raw?.protocolRef
    || raw?.variantSetRef
    || raw?.variantRevisionRef
    || raw?.differenceDecisionRef
    || raw?.correctionRef
    || raw?.correctionRequestRef
    || raw?.assignmentRef
    || null;
  const result = {
    contract: ACTION_CONTRACT,
    operation,
    workspaceId,
    workspaceRevision: raw?.workspaceRevision,
    experimentId: text(raw?.experimentId || raw?.experimentRef?.id),
    experimentRevision: experimentRevision(raw),
    state: experimentState(raw),
    idempotent: raw?.idempotent === true,
    resultRef: specificRef ? ref(specificRef, "resultRef") : null
  };
  if (["start_collection", "rotate_enrollment_code"].includes(operation)) {
    result.enrollmentCode = text(raw?.enrollmentCode);
    result.expiresAt = text(raw?.expiresAt);
  }
  return boundedResponse(result);
}

export async function executeWorkspaceExperimentAction(options) {
  const {
    adapter,
    principal,
    workspaceId,
    operation,
    deadlineAt = null
  } = options;
  if (operation === "list") {
    const limit = Math.min(options.limit || 20, 20);
    const raw = await requireMethod(adapter, "listAuthoringExperiments")({
      actorId: principal?.actorId,
      workspaceId,
      experimentSetRef: options.experimentSetRef || null,
      cursor: options.cursor || null,
      limit,
      deadlineAt
    });
    const resultPage = page(raw, limit);
    const experimentSetRef = ref(raw?.experimentSetRef, "experimentSetRef");
    if (options.experimentSetRef
        && refKey(options.experimentSetRef) !== refKey(experimentSetRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_list_changed",
        "O conjunto de experimentos mudou durante a paginação."
      );
    }
    return boundedResponse({
      contract: ACTION_CONTRACT,
      operation,
      workspaceId,
      workspaceRevision: raw?.workspaceRevision,
      experimentSetRef,
      ...resultPage,
      items: resultPage.items.map((item) => ({
        id: text(item?.id || item?.experimentId),
        experimentRevision: experimentRevision(item),
        title: text(item?.title),
        state: experimentState(item),
        conditionCount: Number(item?.conditionCount) || 0,
        variantCount: Number(item?.variantCount) || 0,
        updatedAt: text(item?.updatedAt)
      }))
    });
  }
  if (operation === "list_options") {
    const limit = Math.min(options.limit || 20, OPTION_LIMITS[options.kind]);
    const raw = await requireMethod(adapter, "listAuthoringExperimentOptions")({
      actorId: principal?.actorId,
      workspaceId,
      kind: options.kind,
      query: options.query || null,
      optionsSetRef: options.optionsSetRef || null,
      cursor: options.cursor || null,
      limit,
      deadlineAt
    });
    const resultPage = page(raw, limit);
    const optionsSetRef = ref(raw?.optionsSetRef, "optionsSetRef");
    if (options.optionsSetRef
        && refKey(options.optionsSetRef) !== refKey(optionsSetRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_options_changed",
        "O snapshot global de opções mudou durante a paginação."
      );
    }
    return boundedResponse({
      contract: ACTION_CONTRACT,
      operation,
      workspaceId,
      workspaceRevision: raw?.workspaceRevision,
      optionsSetRef,
      kind: options.kind,
      ...resultPage,
      items: resultPage.items.map((item) => optionItem(options.kind, item))
    });
  }
  if (operation === "read") {
    const raw = await requireMethod(adapter, "getAuthoringExperiment")({
      actorId: principal?.actorId,
      workspaceId,
      experimentId: options.experimentId,
      section: options.section,
      protocolRevision: options.protocolRevision || null,
      variantSetRef: options.variantSetRef || null,
      variantCursor: options.variantCursor || null,
      variantLimit: Math.min(options.variantLimit || 10, 10),
      differenceSetRef: options.differenceSetRef || null,
      differenceRunCursor: options.differenceRunCursor || null,
      differenceRunLimit: options.differenceRunLimit || 20,
      differenceRunRef: options.differenceRunRef || null,
      differenceCursor: options.differenceCursor || null,
      differenceLimit: options.differenceLimit || 20,
      participantSetRef: options.participantSetRef || null,
      participantCursor: options.participantCursor || null,
      participantLimit: options.participantLimit || 20,
      deadlineAt
    });
    const source = raw?.experiment || raw;
    return boundedResponse({
      contract: ACTION_CONTRACT,
      operation,
      workspaceId,
      workspaceRevision: raw?.workspaceRevision,
      experiment: sectionExperiment(source, options)
    });
  }
  let payload = clone(options.payload);
  if (operation === "save_protocol") {
    payload.protocol = normalizedProtocol(payload.protocol);
  }
  const payloadHash = await sha256Hex(canonicalJsonStringify({ operation, payload }));
  const method = operation === "assign_participant"
    ? "assignAuthoringExperimentParticipant"
    : "manageAuthoringExperiment";
  const experimentId = text(payload?.experimentId) || null;
  const commandPayload = clone(payload);
  delete commandPayload.experimentId;
  const raw = await requireMethod(adapter, method)({
    actorId: principal?.actorId,
    workspaceId,
    experimentId,
    requestId: options.requestId,
    payloadHash,
    expectedExperimentRevision: options.expectedExperimentRevision,
    expectedWorkspaceRevision: options.expectedWorkspaceRevision ?? null,
    operation,
    payload: commandPayload,
    deadlineAt
  });
  return mutationResult(workspaceId, operation, raw);
}

function participantSelection(raw) {
  if (!raw) return null;
  return {
    selectionId: text(raw.selectionId),
    courseId: text(raw.courseId),
    contentHash: text(raw.contentHash),
    readerTarget: {
      courseId: text(raw.readerTarget?.courseId || raw.courseId),
      access: "private",
      contentHash: text(raw.readerTarget?.contentHash || raw.contentHash) || null
    }
  };
}

export async function executeExperimentEnrollmentAction({
  adapter,
  principal,
  operation,
  enrollmentCode = null,
  enrollmentRef = null,
  requestId = null,
  consentPolicyRef = null,
  consentAcknowledged = null,
  deadlineAt = null
}) {
  const payload = {
    operation,
    ...(enrollmentCode ? { enrollmentCode } : {}),
    ...(enrollmentRef ? { enrollmentRef } : {}),
    ...(consentPolicyRef ? { consentPolicyRef } : {}),
    ...(consentAcknowledged == null ? {} : { consentAcknowledged })
  };
  const payloadHash = requestId
    ? await sha256Hex(canonicalJsonStringify(payload))
    : null;
  const raw = await requireMethod(adapter, "manageAuthoringExperimentEnrollment")({
    actorId: principal?.actorId,
    operation,
    enrollmentCode,
    enrollmentRef,
    requestId,
    payloadHash,
    consentPolicyRef,
    consentAcknowledged,
    deadlineAt
  });
  if (operation === "read_policy") {
    return boundedResponse({
      contract: ENROLLMENT_CONTRACT,
      operation,
      title: text(raw?.title),
      policy: {
        ref: ref(raw?.policy?.ref, "policy.ref"),
        label: text(raw?.policy?.label),
        publicText: text(raw?.policy?.publicText)
      }
    });
  }
  const status = text(raw?.status);
  return boundedResponse({
    contract: ENROLLMENT_CONTRACT,
    operation,
    enrollmentRef: text(raw?.enrollmentRef || enrollmentRef),
    status,
    selection: status === "withdrawn" ? null : participantSelection(raw?.selection)
  });
}

function contextFactor(raw) {
  return {
    factorId: text(raw?.factorId),
    definitionRef: ref(raw?.definitionRef, "context.factor.definitionRef"),
    kind: text(raw?.kind),
    targetCount: Number.isInteger(raw?.targetCount) ? raw.targetCount : 0,
    value: raw?.value == null ? null : clone(raw.value),
    resourceSetRef: raw?.resourceSetRef ? ref(raw.resourceSetRef) : null
  };
}

function contextLock(raw) {
  return {
    assignmentRef: ref(raw?.assignmentRef, "context.lock.assignmentRef"),
    definitionRef: ref(raw?.definitionRef, "context.lock.definitionRef"),
    factorId: text(raw?.factorId),
    targetOrdinal: raw?.targetOrdinal,
    scope: { kind: text(raw?.scope?.kind), ref: text(raw?.scope?.ref) }
  };
}

function contextCollectionPage(raw, maximum, field, mapItem) {
  const source = raw || {};
  const resultPage = page(source, maximum);
  return {
    setRef: ref(source?.setRef, `context.${field}.setRef`),
    ...resultPage,
    items: resultPage.items.map(mapItem)
  };
}

async function contextWorkspace({ adapter, principal, workspaceId, raw, deadlineAt }) {
  const source = raw?.workspace;
  if (source?.id && source?.revision) {
    return { id: text(source.id), title: text(source.title), revision: source.revision };
  }
  const resume = await requireMethod(adapter, "getWorkspace")({
    principal, workspaceId, view: "resume", deadlineAt
  });
  return {
    id: text(resume?.workspaceId || resume?.id),
    title: text(resume?.title),
    revision: resume?.revision
  };
}

export async function readAuthoringExperimentContext({
  adapter,
  principal,
  workspaceId,
  experimentRef = null,
  variantRevisionRef = null,
  variantSetRef = null,
  differenceRunRef = null,
  cursor = null,
  limit = 20,
  collection = null,
  collectionSetRef = null,
  collectionCursor = null,
  collectionLimit = 20,
  deadlineAt = null
}) {
  const safeLimit = Math.min(limit || 20, 20);
  const safeCollectionLimit = Math.min(collectionLimit || 20, 20);
  const raw = await requireMethod(adapter, "getAuthoringExperimentContext")({
    actorId: principal?.actorId,
    workspaceId,
    experimentRef,
    variantRevisionRef,
    variantSetRef,
    differenceRunRef,
    cursor,
    limit: safeLimit,
    collection,
    collectionSetRef,
    collectionCursor,
    collectionLimit: safeCollectionLimit,
    deadlineAt
  });
  const workspace = await contextWorkspace({
    adapter, principal, workspaceId, raw, deadlineAt
  });
  const resolvedExactContext = raw?.mode === "target"
    || raw?.experimentContext != null
    || raw?.context != null;
  if (!experimentRef && !resolvedExactContext) {
    const resultPage = page(raw?.variants || raw, safeLimit);
    const returnedVariantSetRef = ref(
      raw?.variantSetRef || raw?.variants?.variantSetRef,
      "variantSetRef"
    );
    if (variantSetRef && refKey(variantSetRef) !== refKey(returnedVariantSetRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_context_list_changed",
        "O conjunto de contextos experimentais mudou durante a descoberta."
      );
    }
    const slice = {
      contract: DESIGN_SLICE_CONTRACT,
      view: "experiment_context",
      availableViews: ["experiment_context"],
      workspace,
      mode: "discovery",
      variantSetRef: returnedVariantSetRef,
      variants: {
        ...resultPage,
        items: resultPage.items.map((item) => ({
          experimentRef: ref(item?.experimentRef, "experimentRef"),
          variantRevisionRef: ref(item?.variantRevisionRef, "variantRevisionRef"),
          experimentLabel: text(item?.experimentLabel),
          conditionLabel: text(item?.conditionLabel),
          status: text(item?.status),
          scope: { kind: text(item?.scope?.kind), ref: text(item?.scope?.ref) },
          targetLabel: text(item?.targetLabel)
        }))
      },
      nextAction: "select_experiment_variant"
    };
    return boundedResponse({
      operation: "read_slice",
      workspaceId,
      revision: workspace.revision,
      result: slice
    });
  }
  const context = raw?.experimentContext || raw?.context || raw;
  const selectedCollection = text(context?.collection || raw?.collection) || null;
  if (collection != null && selectedCollection !== collection) {
    throw new AuthoringApiError(
      409,
      "experiment_context_collection_changed",
      "A coleção devolvida não corresponde à subpágina solicitada."
    );
  }
  const factorTargets = contextCollectionPage(
    context?.factorTargets,
    safeCollectionLimit,
    "factorTargets",
    (target) => ({
      factorId: text(target?.factorId),
      targetOrdinal: target?.targetOrdinal,
      kind: text(target?.kind),
      ref: text(target?.ref)
    })
  );
  const locks = contextCollectionPage(
    context?.locks,
    safeCollectionLimit,
    "locks",
    contextLock
  );
  const resourceSets = contextCollectionPage(
    context?.resourceSetRefs,
    safeCollectionLimit,
    "resourceSetRefs",
    (value) => ref(value, "context.resourceSetRef")
  );
  const targetPaths = contextCollectionPage(
    context?.targetPaths,
    safeCollectionLimit,
    "targetPaths",
    (target) => ({
      entityType: text(target?.entityType),
      entityPath: list(target?.entityPath).slice(0, 4).map(text),
      label: text(target?.label)
    })
  );
  const differenceRuns = contextCollectionPage(
    context?.differenceRuns,
    safeCollectionLimit,
    "differenceRuns",
    (run) => ({
      differenceRunRef: ref(run?.differenceRunRef, "context.differenceRunRef"),
      baselineRef: {
        kind: text(run?.baselineRef?.kind),
        ref: ref(run?.baselineRef?.ref, "context.baselineRef.ref")
      },
      hunkCount: run?.hunkCount,
      recordedCount: run?.recordedCount,
      classifiedCount: run?.classifiedCount,
      status: text(run?.status)
    })
  );
  const selectedPage = {
    factor_targets: factorTargets,
    locks,
    resource_sets: resourceSets,
    target_paths: targetPaths,
    difference_runs: differenceRuns
  }[selectedCollection];
  if (collectionSetRef && refKey(collectionSetRef) !== refKey(selectedPage?.setRef)) {
    throw new AuthoringApiError(
      409,
      "experiment_context_collection_changed",
      "O conjunto da subpágina experimental mudou durante a leitura."
    );
  }
  let differences = null;
  if (differenceRunRef != null) {
    const source = context?.differences || raw?.differences || {};
    const returnedDifferenceRunRef = ref(
      source?.differenceRunRef || context?.differenceRunRef,
      "context.differences.differenceRunRef"
    );
    if (refKey(differenceRunRef) !== refKey(returnedDifferenceRunRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_difference_page_changed",
        "A rodada factual mudou durante a leitura dos hunks."
      );
    }
    const differencePage = page(source, safeLimit);
    differences = {
      differenceRunRef: returnedDifferenceRunRef,
      ...differencePage,
      items: differencePage.items.map((item) => ({
        differenceRef: ref(item?.differenceRef, "context.difference.differenceRef"),
        ordinal: item?.ordinal,
        path: text(Array.isArray(item?.path) ? item.path[0] : item?.path),
        kind: text(item?.kind),
        summary: boundedUtf8Text(item?.factualSummary ?? item?.summary ?? "", 1_000),
        beforeHash: text(item?.beforeHash),
        afterHash: text(item?.afterHash),
        evidenceRefs: list(item?.evidenceRefs).slice(0, 8).map(text),
        classification: text(item?.classification) || null
      }))
    };
  }
  const result = {
    experimentRef: ref(context?.experimentRef || experimentRef, "experimentRef"),
    experimentRevision: experimentRevision(context),
    status: experimentState(context),
    baseRef: ref(context?.baseRef, "context.baseRef"),
    protocolRef: ref(context?.protocolRef, "context.protocolRef"),
    conditionRef: ref(context?.conditionRef, "context.conditionRef"),
    variantRevisionRef: ref(
      context?.variantRevisionRef || variantRevisionRef,
      "context.variantRevisionRef"
    ),
    scope: { kind: text(context?.scope?.kind), ref: text(context?.scope?.ref) },
    factors: list(context?.factors).slice(0, 8).map(contextFactor),
    factorTargets,
    invariants: list(context?.invariants).slice(0, 4).map(text),
    locks,
    resourceSetRefs: resourceSets,
    currentness: {
      base: context?.currentness?.base === true,
      protocol: context?.currentness?.protocol === true,
      condition: context?.currentness?.condition === true,
      variant: context?.currentness?.variant === true,
      design: context?.currentness?.design === true
    },
    mandate: context?.mandate == null ? null : {
      mandateRef: ref(
        context.mandate.mandateRef || context.mandate,
        "context.mandate.mandateRef"
      ),
      status: text(context.mandate.status),
      conditionRef: ref(context.mandate.conditionRef),
      variantRevisionRef: ref(context.mandate.variantRevisionRef)
    },
    targetWorkspaceId: text(context?.targetWorkspaceId),
    targetPaths,
    differenceRuns,
    collection: selectedCollection,
    collectionSetRef: selectedPage?.setRef || null,
    ...(differences == null ? {} : { differences })
  };
  const slice = {
    contract: DESIGN_SLICE_CONTRACT,
    view: "experiment_context",
    availableViews: ["experiment_context"],
    workspace,
    mode: "target",
    experimentContext: result,
    nextAction: differenceRunRef == null
      ? "continue_in_target_workspace"
      : "classify_experiment_diff"
  };
  return boundedResponse({
    operation: "read_slice",
    workspaceId,
    revision: workspace.revision,
    result: slice
  });
}

function materializationEntryIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  if (text(value.packageId) && text(value.version)) {
    return `package:${value.packageId}@${value.version}`;
  }
  if (value.ref?.id && value.ref?.version) return `ref:${refKey(value.ref)}`;
  for (const field of [
    "id", "entityId", "factorId", "conditionId", "microsequenceRef", "differenceId"
  ]) {
    if (text(value[field])) return `${field}:${value[field]}`;
  }
  return "";
}

function materializationValueAtPath(value, path) {
  if (path === "/") return value;
  let current = value;
  for (const rawSegment of path.split("/").slice(1)) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (segment.startsWith("@")) {
      if (!Array.isArray(current)) return undefined;
      const identity = decodeURIComponent(segment.slice(1));
      current = current.find((entry) => materializationEntryIdentity(entry) === identity);
    } else if (Array.isArray(current) && /^(?:0|[1-9][0-9]*)$/u.test(segment)) {
      current = current[Number(segment)];
    } else if (current && typeof current === "object") {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function boundedUtf8Text(value, maximumBytes) {
  let result = "";
  let size = 0;
  for (const character of String(value)) {
    const characterSize = new TextEncoder().encode(character).byteLength;
    if (size + characterSize > maximumBytes) break;
    result += character;
    size += characterSize;
  }
  return result;
}

function publicFactualSummary(before, after) {
  const encoded = (value) => value === undefined
    ? "<absent>"
    : canonicalJsonStringify(value);
  const beforeText = boundedUtf8Text(encoded(before), 450);
  const afterText = boundedUtf8Text(encoded(after), 450);
  return boundedUtf8Text(`before=${beforeText}\nafter=${afterText}`, 1_000);
}

async function factualValueHash(value) {
  return sha256Hex(canonicalJsonStringify(
    value === undefined ? { present: false } : { present: true, value }
  ));
}

function evidenceRefStrings(...sources) {
  return [...new Set(sources.flatMap((source) => {
    const artifact = source?.artifactRef;
    const artifactHash = text(source?.artifact?.hash);
    const baselineArtifact = source?.baselineRef?.ref;
    return [
      ...(artifact?.id && artifact?.version ? [`${artifact.id}@${artifact.version}`] : []),
      ...(artifactHash ? [`artifact:sha256:${artifactHash}`] : []),
      ...(baselineArtifact?.id && baselineArtifact?.version
        ? [`${baselineArtifact.id}@${baselineArtifact.version}`]
        : []),
      ...list(source?.evidenceRefs).map(text).filter(Boolean)
    ];
  }))].slice(0, 8);
}

async function factualHunk(item, baseline, candidate, evidenceRefs) {
  const before = item.kind === "moved"
    ? item.before
    : materializationValueAtPath(baseline, item.path);
  const after = item.kind === "moved"
    ? item.after
    : materializationValueAtPath(candidate, item.path);
  const factual = {
    differenceId: text(item.differenceId),
    ordinal: item.ordinal,
    path: [text(item.path)],
    kind: text(item.kind),
    factualSummary: publicFactualSummary(item.before, item.after),
    beforeHash: await factualValueHash(before),
    afterHash: await factualValueHash(after),
    evidenceRefs
  };
  const hunkHash = await sha256Hex(canonicalJsonStringify(factual));
  return {
    ...factual,
    differenceRef: {
      id: `h-${hunkHash.slice(0, 32)}`,
      version: hunkHash
    }
  };
}

async function loadEvidenceMaterialization({
  adapter,
  source,
  field,
  deadlineAt
}) {
  const artifact = source?.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_evidence_source",
      `${field} não contém o descriptor do artefato imutável.`
    );
  }
  const value = await requireMethod(
    adapter,
    "loadAuthoringExperimentEvidenceArtifact"
  )({ artifact, deadlineAt });
  if (value == null) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_evidence_source",
      `${field} não contém a materialização imutável.`
    );
  }
  return value;
}

function sortedEvidenceBaselines(raw) {
  const baselines = list(raw?.baselines);
  if (baselines.length < 1 || baselines.length > 32) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_evidence_source",
      "O backend precisa fornecer a base e no máximo 31 variantes anteriores."
    );
  }
  return [...baselines].sort((left, right) => {
    const leftKind = text(left?.baselineRef?.kind);
    const rightKind = text(right?.baselineRef?.kind);
    if (leftKind !== rightKind) return leftKind === "base" ? -1 : 1;
    return refKey(left?.baselineRef?.ref).localeCompare(refKey(right?.baselineRef?.ref), "en");
  });
}

function deterministicUuidFromHash(hash) {
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join("-");
}

function completedEvidenceProgress(raw, field) {
  if (raw?.complete !== true) return null;
  const differenceRunRef = ref(raw?.differenceRunRef, `${field}.differenceRunRef`);
  const expectedCount = Number(raw?.expectedCount);
  const recordedCount = Number(raw?.recordedCount);
  const pageCount = Number(raw?.pageCount);
  const firstMissingPageOrdinal = raw?.firstMissingPageOrdinal;
  const factualHash = differenceRunRef.version;
  if (!/^[a-f0-9]{64}$/u.test(factualHash)
      || differenceRunRef.id !== deterministicUuidFromHash(factualHash)
      || !Number.isInteger(expectedCount)
      || expectedCount < 0
      || expectedCount > 5_000
      || recordedCount !== expectedCount
      || !Number.isInteger(pageCount)
      || pageCount !== Math.max(1, Math.ceil(expectedCount / 20))
      || (firstMissingPageOrdinal != null
        && firstMissingPageOrdinal !== pageCount + 1)) {
    throw new AuthoringApiError(
      409,
      "experiment_evidence_progress_changed",
      "O progresso factual completo diverge dos pins e contagens registrados."
    );
  }
  return {
    differenceRunRef,
    expectedCount,
    recordedCount,
    pageCount
  };
}

export async function registerAuthoringExperimentVariantEvidence({
  adapter,
  principal,
  workspaceId,
  requestId,
  expectedRevision,
  microsequencePath,
  payload,
  deadlineAt = null,
  evidencePageCallLimit = EVIDENCE_PAGE_CALL_MAX
}) {
  exactObject(
    payload,
    ["experimentRef", "variantRevisionRef", "mandateRef"],
    "payload"
  );
  const requested = {
    experimentRef: ref(payload.experimentRef, "experimentRef"),
    variantRevisionRef: ref(payload.variantRevisionRef, "variantRevisionRef"),
    mandateRef: ref(payload.mandateRef, "mandateRef")
  };
  let expectedExperimentRevision = Number(requested.experimentRef.version);
  if (!Number.isSafeInteger(expectedExperimentRevision) || expectedExperimentRevision < 1) {
    throw new AuthoringApiError(
      422,
      "invalid_experiment_reference_revision",
      "experimentRef.version deve pinar a revisão inteira corrente."
    );
  }
  const sourceCommand = {
    experimentRef: requested.experimentRef,
    variantRevisionRef: requested.variantRevisionRef,
    mandateRef: requested.mandateRef,
    scopePath: microsequencePath,
    expectedExperimentRevision,
    expectedWorkspaceRevision: expectedRevision
  };
  const sourcePayloadHash = await sha256Hex(canonicalJsonStringify(sourceCommand));
  const sourceRequestHash = await sha256Hex(canonicalJsonStringify({
    requestId,
    purpose: "load_immutable_experiment_evidence_inputs"
  }));
  const source = await requireMethod(
    adapter,
    "getAuthoringExperimentVariantEvidenceInputs"
  )({
    actorId: principal?.actorId,
    workspaceId,
    requestId: `experiment-evidence-inputs:${sourceRequestHash.slice(0, 64)}`,
    payloadHash: sourcePayloadHash,
    expectedExperimentRevision,
    expectedWorkspaceRevision: expectedRevision,
    experimentRef: requested.experimentRef,
    variantRevisionRef: requested.variantRevisionRef,
    mandateRef: requested.mandateRef,
    scopePath: microsequencePath,
    deadlineAt
  });
  if (text(source?.targetWorkspaceId) !== workspaceId) {
    throw new AuthoringApiError(
      409,
      "experiment_evidence_source_changed",
      "Os artefatos imutáveis não pertencem ao workspace filho corrente."
    );
  }
  for (const field of ["variantRevisionRef", "mandateRef"]) {
    if (refKey(ref(source?.[field], `evidence.${field}`)) !== refKey(requested[field])) {
      throw new AuthoringApiError(
        409,
        "experiment_evidence_source_changed",
        "Os artefatos não pertencem ao experimento, variante e mandato solicitados."
      );
    }
  }
  const currentExperimentRef = ref(
    source?.experimentRef,
    "evidence.currentExperimentRef"
  );
  const currentExperimentRevision = Number(currentExperimentRef.version);
  if (currentExperimentRef.id !== requested.experimentRef.id
      || !Number.isSafeInteger(currentExperimentRevision)
      || currentExperimentRevision < expectedExperimentRevision) {
    throw new AuthoringApiError(
      409,
      "experiment_evidence_progress_changed",
      "O progresso factual não pertence à revisão corrente do experimento."
    );
  }
  expectedExperimentRevision = currentExperimentRevision;
  const candidate = source?.candidate;
  const algorithmRef = ref(source?.algorithmRef, "evidence.algorithmRef");
  if (refKey(algorithmRef) !== refKey(EXPERIMENT_FACTUAL_DIFF_ALGORITHM_REF)) {
    throw new AuthoringApiError(
      500,
      "invalid_experiment_evidence_source",
      "O algoritmo factual preparado não corresponde ao contrato canônico."
    );
  }
  const baselines = sortedEvidenceBaselines(source);
  const preparedBaselines = baselines.map((baseline, index) => {
    const baselineRef = {
      kind: text(baseline?.baselineRef?.kind),
      ref: ref(baseline?.baselineRef?.ref, `evidence.baselines[${index}].baselineRef.ref`)
    };
    if (!new Set(["base", "variant_revision"]).has(baselineRef.kind)) {
      throw new AuthoringApiError(
        500,
        "invalid_experiment_evidence_source",
        "baselineRef.kind não é canônico."
      );
    }
    const progress = baseline?.progress || baseline;
    return {
      baseline,
      baselineRef,
      progress,
      completed: completedEvidenceProgress(
        progress,
        `evidence.baselines[${index}].progress`
      )
    };
  });
  const differenceRunRefs = Array.from({ length: preparedBaselines.length }, () => null);
  let recorded = 0;
  let expected = 0;
  for (let index = 0; index < preparedBaselines.length; index += 1) {
    const completed = preparedBaselines[index].completed;
    if (!completed) continue;
    differenceRunRefs[index] = completed.differenceRunRef;
    recorded += completed.recordedCount;
    expected += completed.expectedCount;
  }
  const allProgressComplete = preparedBaselines.every(({ completed }) => completed != null);
  if (allProgressComplete) {
    return boundedResponse({
      operation: "register_experiment_variant_evidence",
      workspaceId,
      revision: expectedRevision,
      replayed: source?.idempotent === true || source?.replayed === true,
      result: {
        experimentRef: {
          id: requested.experimentRef.id,
          version: String(expectedExperimentRevision)
        },
        variantRevisionRef: requested.variantRevisionRef,
        differenceRunRefs,
        recorded,
        expected,
        complete: true,
        nextAction: null
      }
    });
  }
  const cannotStartEvidencePage = evidencePageCallLimit < 1
    || (Number.isFinite(deadlineAt)
      && Date.now() + EVIDENCE_DEADLINE_RESERVE_MS >= deadlineAt);
  if (cannotStartEvidencePage) {
    return boundedResponse({
      operation: "register_experiment_variant_evidence",
      workspaceId,
      revision: expectedRevision,
      replayed: source?.idempotent === true || source?.replayed === true,
      result: {
        experimentRef: {
          id: requested.experimentRef.id,
          version: String(expectedExperimentRevision)
        },
        variantRevisionRef: requested.variantRevisionRef,
        differenceRunRefs: differenceRunRefs.filter(Boolean),
        recorded,
        expected,
        complete: false,
        nextAction: "reread_context_and_repeat_registration"
      }
    });
  }
  const candidateValue = await loadEvidenceMaterialization({
    adapter,
    source: candidate,
    field: "candidate",
    deadlineAt
  });
  const registerPage = requireMethod(
    adapter,
    "registerAuthoringExperimentVariantEvidencePage"
  );
  let allReplayed = source?.idempotent === true || source?.replayed === true;
  let complete = true;
  let pageCalls = 0;
  let yielded = false;
  for (let runIndex = 0; runIndex < preparedBaselines.length; runIndex += 1) {
    const prepared = preparedBaselines[runIndex];
    if (prepared.completed) continue;
    if (yielded
        || pageCalls >= evidencePageCallLimit
        || (Number.isFinite(deadlineAt)
        && Date.now() + EVIDENCE_DEADLINE_RESERVE_MS >= deadlineAt)) {
      yielded = true;
      complete = false;
      break;
    }
    const { baseline, baselineRef, progress } = prepared;
    const baselineValue = await loadEvidenceMaterialization({
      adapter,
      source: baseline,
      field: "baseline",
      deadlineAt
    });
    let diff;
    try {
      diff = diffExperimentVariantMaterializations(baselineValue, candidateValue, {
        maximum: 5_000,
        baselineRef,
        candidateVariantRevisionRef: requested.variantRevisionRef,
        deadlineAt: Number.isFinite(deadlineAt)
          ? deadlineAt - EVIDENCE_DEADLINE_RESERVE_MS
          : null
      });
    } catch (cause) {
      if (cause?.code === "EXPERIMENT_DIFFERENCE_DEADLINE_REACHED") {
        yielded = true;
        complete = false;
        break;
      }
      if (cause?.code !== "EXPERIMENT_DIFFERENCE_LIMIT_EXCEEDED") throw cause;
      throw new AuthoringApiError(
        422,
        "experiment_difference_limit_exceeded",
        "A materialização excede o teto factual canônico de 5.000 hunks."
      );
    }
    const hunkEvidenceRefs = evidenceRefStrings(baseline, candidate);
    const hunks = [];
    for (const item of diff.items) {
      hunks.push(await factualHunk(item, baselineValue, candidateValue, hunkEvidenceRefs));
    }
    const factualHash = await sha256Hex(canonicalJsonStringify({
      algorithmRef,
      baselineRef,
      candidateVariantRevisionRef: requested.variantRevisionRef,
      hunks
    }));
    const differenceRunRef = {
      id: deterministicUuidFromHash(factualHash),
      version: factualHash
    };
    const pages = [];
    for (let offset = 0; offset < hunks.length; offset += 20) {
      pages.push(hunks.slice(offset, offset + 20));
    }
    if (!pages.length) pages.push([]);
    expected += hunks.length;
    const preparedRunRef = progress?.differenceRunRef
      ? ref(progress.differenceRunRef, "evidence.progress.differenceRunRef")
      : null;
    if (preparedRunRef && refKey(preparedRunRef) !== refKey(differenceRunRef)) {
      throw new AuthoringApiError(
        409,
        "experiment_evidence_progress_changed",
        "A rodada factual preparada diverge dos artefatos imutáveis relidos."
      );
    }
    if (Number.isInteger(progress?.expectedCount)
        && progress.expectedCount !== hunks.length) {
      throw new AuthoringApiError(
        409,
        "experiment_evidence_progress_changed",
        "A contagem factual preparada diverge da materialização relida."
      );
    }
    if (Number.isInteger(progress?.pageCount)
        && progress.pageCount !== pages.length) {
      throw new AuthoringApiError(
        409,
        "experiment_evidence_progress_changed",
        "A paginação factual preparada diverge da materialização relida."
      );
    }
    const firstMissingPageOrdinal = Number.isInteger(progress?.firstMissingPageOrdinal)
      ? progress.firstMissingPageOrdinal
      : 1;
    if (firstMissingPageOrdinal < 1 || firstMissingPageOrdinal > pages.length + 1) {
      throw new AuthoringApiError(
        500,
        "invalid_experiment_evidence_source",
        "O progresso factual contém uma página inicial inválida."
      );
    }
    let runRecorded = Number.isInteger(progress?.recordedCount)
      ? progress.recordedCount
      : 0;
    if (runRecorded < 0 || runRecorded > hunks.length) {
      throw new AuthoringApiError(
        500,
        "invalid_experiment_evidence_source",
        "O progresso factual contém uma contagem registrada inválida."
      );
    }
    let runComplete = progress?.complete === true
      || firstMissingPageOrdinal === pages.length + 1;
    if (runComplete && runRecorded !== hunks.length) {
      throw new AuthoringApiError(
        409,
        "experiment_evidence_progress_changed",
        "O progresso factual completo diverge da contagem recomputada."
      );
    }
    differenceRunRefs[runIndex] = differenceRunRef;
    for (let pageIndex = firstMissingPageOrdinal - 1;
      !runComplete && pageIndex < pages.length;
      pageIndex += 1) {
      if (pageCalls >= evidencePageCallLimit
          || (Number.isFinite(deadlineAt)
            && Date.now() + EVIDENCE_DEADLINE_RESERVE_MS >= deadlineAt)) {
        yielded = true;
        complete = false;
        break;
      }
      const pagePayload = {
        experimentRef: {
          id: requested.experimentRef.id,
          version: String(expectedExperimentRevision)
        },
        variantRevisionRef: requested.variantRevisionRef,
        mandateRef: requested.mandateRef,
        differenceRunRef,
        baselineRef,
        algorithmRef,
        factualHash,
        pageOrdinal: pageIndex + 1,
        pageCount: pages.length,
        hunkCount: hunks.length,
        hunks: pages[pageIndex]
      };
      const pagePayloadHash = await sha256Hex(canonicalJsonStringify(pagePayload));
      const derivedRequestHash = await sha256Hex(canonicalJsonStringify({
        requestId,
        differenceRunRef,
        pageOrdinal: pageIndex + 1
      }));
      const raw = await registerPage({
        actorId: principal?.actorId,
        workspaceId,
        experimentId: requested.experimentRef.id,
        requestId: `experiment-evidence:${derivedRequestHash.slice(0, 64)}`,
        payloadHash: pagePayloadHash,
        expectedExperimentRevision,
        expectedWorkspaceRevision: expectedRevision,
        variantRevisionRef: requested.variantRevisionRef,
        mandateRef: requested.mandateRef,
        differenceRunRef,
        baselineRef,
        candidateVariantRevisionRef: requested.variantRevisionRef,
        algorithmRef,
        pageOrdinal: pageIndex + 1,
        pageCount: pages.length,
        hunkCount: hunks.length,
        hunks: pages[pageIndex],
        deadlineAt
      });
      pageCalls += 1;
      expectedExperimentRevision = positiveBackendRevision(
        raw?.experimentRevision ?? raw?.experimentRef?.version,
        "evidence.experimentRevision"
      );
      runRecorded = Number.isInteger(raw?.recordedCount)
        ? raw.recordedCount
        : Math.max(0, hunks.length - (Number(raw?.pendingCount) || 0));
      allReplayed &&= raw?.idempotent === true || raw?.replayed === true;
      runComplete = (Number(raw?.pendingCount) || 0) === 0;
    }
    recorded += runRecorded;
    complete &&= runComplete;
  }
  return boundedResponse({
    operation: "register_experiment_variant_evidence",
    workspaceId,
    revision: expectedRevision,
    replayed: allReplayed,
    result: {
      experimentRef: {
        id: requested.experimentRef.id,
        version: String(expectedExperimentRevision)
      },
      variantRevisionRef: requested.variantRevisionRef,
      differenceRunRefs: differenceRunRefs.filter(Boolean),
      recorded,
      expected,
      complete: !yielded && complete && recorded === expected,
      nextAction: !yielded && complete && recorded === expected
        ? null
        : "reread_context_and_repeat_registration"
    }
  });
}

export async function recordAuthoringExperimentDiffClassification({
  adapter,
  principal,
  workspaceId,
  requestId,
  expectedRevision,
  microsequencePath,
  payload,
  deadlineAt = null
}) {
  let classifications;
  try {
    classifications = normalizeExperimentDifferenceClassifications(
      payload?.classifications
    );
  } catch (cause) {
    throw new AuthoringApiError(
      422,
      "invalid_experiment_difference_classification",
      cause instanceof Error ? cause.message : "Classificação de diff inválida."
    );
  }
  if (classifications.length > 20) {
    throw new AuthoringApiError(
      422,
      "experiment_difference_batch_too_large",
      "Classifique no máximo 20 hunks por chamada."
    );
  }
  const normalized = {
    experimentRef: ref(payload?.experimentRef, "experimentRef"),
    variantRevisionRef: ref(payload?.variantRevisionRef, "variantRevisionRef"),
    differenceRunRef: ref(payload?.differenceRunRef, "differenceRunRef"),
    mandateRef: ref(payload?.mandateRef, "mandateRef"),
    classifications
  };
  const payloadHash = await sha256Hex(canonicalJsonStringify({
    operation: "record_experiment_diff_classification",
    microsequencePath,
    payload: normalized
  }));
  const expectedExperimentRevision = Number(normalized.experimentRef.version);
  if (!Number.isInteger(expectedExperimentRevision) || expectedExperimentRevision < 1) {
    throw new AuthoringApiError(
      422,
      "invalid_experiment_reference_revision",
      "experimentRef.version deve pinar a revisão inteira corrente."
    );
  }
  const raw = await requireMethod(
    adapter,
    "recordAuthoringExperimentDiffClassifications"
  )({
    actorId: principal?.actorId,
    workspaceId,
    experimentId: normalized.experimentRef.id,
    requestId,
    expectedRevision,
    expectedExperimentRevision,
    expectedWorkspaceRevision: expectedRevision,
    differenceRunId: normalized.differenceRunRef.id,
    differenceRunRef: normalized.differenceRunRef,
    mandateRef: normalized.mandateRef,
    variantRevisionRef: normalized.variantRevisionRef,
    microsequencePath,
    payloadHash,
    classifications,
    deadlineAt
  });
  return {
    operation: "record_experiment_diff_classification",
    workspaceId,
    revision: raw?.revision ?? expectedRevision,
    replayed: raw?.replayed === true || raw?.idempotent === true,
    result: {
      variantRevisionRef: ref(raw?.variantRevisionRef || normalized.variantRevisionRef),
      differenceRunRef: ref(
        raw?.differenceRunRef || raw?.differenceRef || normalized.differenceRunRef
      ),
      classificationRef: ref(raw?.classificationRef, "classificationRef"),
      status: text(raw?.status),
      recordedCount: Number(raw?.recordedCount) || 0,
      pendingCount: Number(raw?.pendingCount) || 0
    }
  };
}
