import { assembleAuthoringRun } from "./assembler.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import {
  assertFragmentMatchesSpecification,
  assertPreservedPointers,
  assertSubmissionMatchesContinuity,
  deterministicRequestUuid,
  prepareCourseDocument
} from "./canonical.js";
import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { buildNextPart } from "./continuity.js";
import {
  buildCourseContentRevisionFragment,
  prepareCourseContentRevision
} from "./contentRevision.js";
import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract,
  listAuthoringResourceContracts
} from "../aralearn/runtime/core/authoringResourceContract.js";
import {
  ACTION_PLAN_BODY_LIMIT,
  ACTION_RESPONSE_BODY_LIMIT,
  MANUAL_IMPORT_BODY_LIMIT,
  LEDGER_CHUNK_BODY_LIMIT,
  PLAN_BODY_LIMIT,
  STANDARD_BODY_LIMIT,
  normalizeAuthoringPath,
  readJsonBody,
  routeRequest,
  validateAuditPayload,
  validateBlockPayload,
  validateCreateCatalogCollectionPayload,
  validateCreatePersonalStudyPathPayload,
  validateCreatePrivateIntegrationPayload,
  validateCreateRunPayload,
  validateApplyCourseRevisionPayload,
  validateDeletePersonalStudyPathPayload,
  validateImportPayload,
  validateMoveCatalogCoursePayload,
  validateMovePersonalCourseSelectionPayload,
  validateOpenCourseRevisionPayload,
  validatePartPayload,
  validatePartSpecificationEnvelope,
  validatePartSpecificationPayload,
  validateLedgerChunkPayload,
  validateFinalizePlanPayload,
  validateCancelRunPayload,
  validateCatalogSubmissionDecisionPayload,
  validateCatalogSubmissionPayload,
  validatePlanPayload,
  validateRenameCatalogCollectionPayload,
  validateRenamePersonalLibraryCoursePayload,
  validateRenamePersonalStudyPathPayload,
  validateReorderCatalogCollectionsPayload,
  validateReorderCatalogCoursesPayload,
  validateReopenPartPayload,
  validateSaveCourseRevisionPayload,
  validateRetireCatalogCollectionPayload,
  validateResumePayload,
  validateRotatePrivateIntegrationPayload,
  validateRunId,
  validateSimpleCommandPayload,
  validateUpdateCatalogCoursePayload,
  validateWithdrawCatalogSubmissionPayload
} from "./protocol.js";
import {
  assertScope,
  corsHeaders,
  issueSubmissionReadReceipt,
  preflightHeaders,
  readAuthorization,
  sha256Hex,
  verifySubmissionReadReceipt
} from "./security.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});
const ROUTES_WITH_REDUNDANT_BODY_IDENTITY = new Set(["submitPart", "auditPart", "reopenPart"]);
const EXISTING_RUN_MUTATION_ACTIONS = new Map([
  ["setPlan", "write"],
  ["putLedgerChunk", "write"],
  ["finalizePlan", "write"],
  ["setPartSpecification", "write"],
  ["submitPart", "write"],
  ["auditPart", "audit"],
  ["reopenPart", "audit"],
  ["validateRun", "audit"],
  ["publishRun", "publish"],
  ["cancelRun", "write"],
  ["blockRun", "write"],
  ["resumeRun", "write"]
]);
const REPLAYABLE_EXISTING_RUN_ROUTES = new Set([
  "setPlan",
  "putLedgerChunk",
  "finalizePlan",
  "setPartSpecification",
  "submitPart",
  "auditPart",
  "reopenPart",
  "validateRun",
  "cancelRun",
  "blockRun",
  "resumeRun"
]);
const CATALOG_STRUCTURE_SECTIONS = new Set([
  "modules",
  "lessons",
  "guides",
  "guideItems",
  "topics",
  "topicStatements",
  "microsequences",
  "dependencies",
  "microsequenceStatements",
  "cards",
  "blocks",
  "options",
  "nodes",
  "flowNodes",
  "flowCases",
  "flowPractices",
  "flowPracticeEntries",
  "flowPracticeOptions",
  "flowPracticeVariants",
  "flowShapeOptions",
  "edges",
  "matrixItems",
  "cells",
  "points",
  "lines",
  "highlights",
  "cardSources",
  "cardTopics",
  "learningComponents",
  "learningComponentTopicLinks",
  "learningComponentRelations",
  "learningComponentPlacements"
]);

function responseBody(ok, requestId, value) {
  return ok
    ? { ok: true, requestId, data: value ?? null }
    : { ok: false, requestId, error: value };
}

function compactErrorDetails(value) {
  if (!value || typeof value !== "object") return value;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16 * 1024) return value;
  const errors = Array.isArray(value.errors) ? value.errors : [];
  if (!errors.length) return { truncated: true };
  return {
    errors: errors.slice(0, 20).map((error) => ({
      code: String(error?.code || "invalid").slice(0, 120),
      path: String(error?.path || "$").slice(0, 500),
      message: String(error?.message || "Dado inválido.").slice(0, 1000)
    })),
    omittedErrors: Math.max(0, errors.length - 20),
    truncated: true
  };
}

function jsonResponse(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function encodedJsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactActionRunSummary(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return run;
  const compact = { ...run };
  delete compact.brief;
  if (Array.isArray(compact.parts)) {
    compact.parts = compact.parts.map((part) => {
      if (!part || typeof part !== "object" || !part.latestAudit) return part;
      const audit = part.latestAudit;
      const findings = audit?.findings?.findings;
      return {
        ...part,
        latestAudit: {
          attempt: audit.attempt,
          decision: audit.decision,
          findingCount: Array.isArray(findings) ? findings.length : 0,
          createdAt: audit.createdAt
        }
      };
    });
  }
  if (compact.validation && typeof compact.validation === "object") {
    const errors = Array.isArray(compact.validation.errors) ? compact.validation.errors : [];
    compact.validation = {
      valid: compact.validation.valid === true,
      errorCount: errors.length,
      documentHash: compact.validation.documentHash || compact.documentHash || null,
      compacted: true
    };
  }
  compact.compact = true;
  return compact;
}

function assertActionResponseBudget(data, code, message) {
  if (encodedJsonBytes(data) > ACTION_RESPONSE_BODY_LIMIT) {
    throw new AuthoringApiError(422, code, message);
  }
  return data;
}

function requestIdFromHeaders(request) {
  return String(request.headers.get("idempotency-key") || "").trim();
}

function reconcileRequestId(request, payload) {
  const header = requestIdFromHeaders(request);
  if (header && payload.requestId && header !== payload.requestId) {
    throw new AuthoringApiError(
      422,
      "request_id_mismatch",
      "Idempotency-Key e requestId devem ter o mesmo valor."
    );
  }
  return payload.requestId || header;
}

async function apiRequestHash(request, rawPayload) {
  const url = new URL(request.url);
  const path = normalizeAuthoringPath(url.pathname);
  const route = routeRequest(request.method, path);
  let canonicalPayload = rawPayload;
  if (ROUTES_WITH_REDUNDANT_BODY_IDENTITY.has(route.name)
      && rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    canonicalPayload = { ...rawPayload };
    delete canonicalPayload.runId;
    delete canonicalPayload.partKey;
  }
  return sha256Hex(
    `${request.method.toUpperCase()}\n${path}\n${canonicalJsonStringify(canonicalPayload)}`
  );
}

async function replayCommand(adapter, request, {
  principal, requestId, rawPayload, requiredScope = "authoring:write"
}) {
  if (typeof adapter.replayCommand !== "function") return null;
  return adapter.replayCommand({
    principal,
    requestId,
    apiRequestHash: await apiRequestHash(request, rawPayload),
    requiredScope
  });
}

function replayCandidateRequestId(request, rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const requestId = rawPayload.requestId;
  if (typeof requestId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId)) {
    return null;
  }
  const header = requestIdFromHeaders(request);
  return header && header !== requestId ? null : requestId;
}

async function replayCommandBeforeDetailedValidation(adapter, request, {
  principal,
  rawPayload,
  action
}) {
  const requestId = replayCandidateRequestId(request, rawPayload);
  if (!requestId) return undefined;
  return replayCommand(adapter, request, {
    principal,
    requestId,
    rawPayload,
    requiredScope: action === "audit" ? "authoring:audit" : "authoring:write"
  });
}

async function replayCommandOnce(preflightReplay, adapter, request, options) {
  return preflightReplay === undefined
    ? replayCommand(adapter, request, options)
    : preflightReplay;
}

async function commandPayload(request, rawPayload, payload) {
  return { ...payload, _apiRequestHash: await apiRequestHash(request, rawPayload) };
}

function withRoutePartIdentity(rawPayload, route) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return rawPayload;
  }
  return {
    ...rawPayload,
    runId: rawPayload.runId ?? route.runId,
    partKey: rawPayload.partKey ?? route.partKey
  };
}

async function readRunSummary(adapter, args) {
  return typeof adapter.getRunSummary === "function"
    ? adapter.getRunSummary(args)
    : adapter.getRun(args);
}

async function readRunAuthorizationSummary(adapter, args) {
  return typeof adapter.getRunAuthorizationSummary === "function"
    ? adapter.getRunAuthorizationSummary(args)
    : readRunSummary(adapter, args);
}

async function readNextPartState(adapter, args) {
  return typeof adapter.getNextPart === "function"
    ? adapter.getNextPart(args)
    : adapter.getRun(args);
}

function nextActionReference(runId, action = "consult_state", partKey = null) {
  if (action === "read_submission" && partKey) {
    return {
      action,
      method: "GET",
      path: `/v1/runs/${runId}/parts/${partKey}/submission`
    };
  }
  if (action === "validate") {
    return {
      action,
      method: "POST",
      path: `/v1/runs/${runId}/validate`
    };
  }
  if (action === "prepare_publish") {
    return {
      action,
      method: "POST",
      path: `/v1/runs/${runId}/publish`,
      requiresExplicitConfirmation: true
    };
  }
  return {
    action,
    method: "GET",
    path: `/v1/runs/${runId}/next-part`
  };
}

function nextActionForRunState(run, runId) {
  const status = String(run?.status || "");
  if (status === "ready_for_validation") return nextActionReference(runId, "validate");
  if (status === "validated") return nextActionReference(runId, "prepare_publish");
  return null;
}

function attachNextAction(data, payload, principal, runId) {
  if (!payload) return data;
  const candidate = {
    ...data,
    nextAction: payload.action,
    nextActionPayload: payload
  };
  if (principal.authenticationKind !== "api_key"
      || encodedJsonBytes(candidate) <= ACTION_RESPONSE_BODY_LIMIT) {
    return candidate;
  }
  return {
    ...data,
    nextAction: payload.action,
    nextActionPayload: nextActionReference(runId, payload.action, payload.partKey)
  };
}

async function attachPersistedNextPart(adapter, principal, runId, data) {
  try {
    const run = await readNextPartState(adapter, { principal, runId });
    const payload = await buildNextPart(run) || nextActionForRunState(run, runId);
    return attachNextAction(data, payload, principal, runId);
  } catch {
    // O comando anterior já foi confirmado pelo banco. Uma falha na leitura
    // auxiliar não pode transformar uma gravação concluída em falha aparente.
    return attachNextAction(
      data,
      nextActionReference(runId, "consult_state"),
      principal,
      runId
    );
  }
}

function assertAuthoringScope(principal, action, target = null) {
  const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
  const required = target === "private"
    ? [`authoring:private:${action}`]
    : target === "catalog"
      ? [`authoring:${action}`]
      : [`authoring:${action}`, `authoring:private:${action}`];
  if (scopes.has("*") || required.some((scope) => scopes.has(scope))) return;
  throw new AuthoringApiError(
    403,
    "insufficient_scope",
    "A credencial não permite esta operação de autoria."
  );
}

function authoringRunTarget(run) {
  return (run?.publicationTarget || run?.target) === "private"
    ? "private"
    : "catalog";
}

async function authorizeExistingRun(adapter, {
  principal,
  runId,
  action
}) {
  const run = await readRunAuthorizationSummary(adapter, { principal, runId });
  const target = authoringRunTarget(run);
  if (action === "publish") {
    if (target === "private") {
      assertAuthoringScope(principal, "write", "private");
    } else {
      assertScope(principal, "catalog:publish");
    }
  } else {
    assertAuthoringScope(principal, action, target);
  }
  return run;
}

function assertPotentialExistingRunScope(principal, action) {
  if (action !== "publish") {
    assertAuthoringScope(principal, action);
    return;
  }
  const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
  if (scopes.has("*")
      || scopes.has("catalog:publish")
      || scopes.has("authoring:private:write")) {
    return;
  }
  throw new AuthoringApiError(
    403,
    "insufficient_scope",
    "A credencial não permite concluir uma execução de autoria."
  );
}

function assertAuthenticatedSession(principal) {
  if (principal?.authenticationKind === "jwt" && principal.actorId) return;
  throw new AuthoringApiError(
    403,
    "session_required",
    "Gerencie integrações pessoais por uma sessão autenticada."
  );
}

function catalogPagination(request, { retired = false } = {}) {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit == null || rawLimit === "" ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "limit deve ser um inteiro entre 1 e 100."
    );
  }
  const query = String(url.searchParams.get("query") || "").trim();
  if (query.length > 200) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "query deve ter no máximo 200 caracteres."
    );
  }
  const rawAfterPosition = url.searchParams.get("afterPosition");
  const rawAfterId = url.searchParams.get("afterId");
  if ((rawAfterPosition == null) !== (rawAfterId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterPosition e afterId devem ser informados juntos."
    );
  }
  let cursor = {};
  if (rawAfterPosition != null) {
    const afterPosition = Number(rawAfterPosition);
    if (!Number.isSafeInteger(afterPosition) || afterPosition < 0) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "afterPosition deve ser um inteiro não negativo."
      );
    }
    cursor = {
      afterPosition,
      afterId: validateRunId(rawAfterId)
    };
  }
  let includeRetired = false;
  if (retired) {
    const rawIncludeRetired = url.searchParams.get("includeRetired");
    if (rawIncludeRetired != null && !new Set(["true", "false"]).has(rawIncludeRetired)) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "includeRetired deve ser true ou false."
      );
    }
    includeRetired = rawIncludeRetired === "true";
  }
  return { limit, query, includeRetired, ...cursor };
}

function catalogStructurePagination(request) {
  const url = new URL(request.url);
  const section = String(url.searchParams.get("section") || "modules");
  if (!CATALOG_STRUCTURE_SECTIONS.has(section)) {
    throw new AuthoringApiError(
      422,
      "invalid_structure_section",
      "section não identifica uma seção formal do curso."
    );
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit == null || rawLimit === "" ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "limit deve ser um inteiro entre 1 e 100."
    );
  }
  const rawParentId = url.searchParams.get("parentId");
  const parentId = rawParentId == null || rawParentId === ""
    ? null
    : validateRunId(rawParentId);
  const rawAfterPosition = url.searchParams.get("afterPosition");
  const rawAfterId = url.searchParams.get("afterId");
  if ((rawAfterPosition == null) !== (rawAfterId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterPosition e afterId devem ser informados juntos."
    );
  }
  let cursor = {};
  if (rawAfterPosition != null) {
    const afterPosition = Number(rawAfterPosition);
    if (!Number.isSafeInteger(afterPosition) || afterPosition < 0) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "afterPosition deve ser um inteiro não negativo."
      );
    }
    cursor = {
      afterPosition,
      afterId: validateRunId(rawAfterId)
    };
  }
  return { section, parentId, limit, ...cursor };
}

function personalLibraryPagination(request, {
  maxLimit = 100,
  cursorId = "afterId",
  query = false
} = {}) {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit == null || rawLimit === "" ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      `limit deve ser um inteiro entre 1 e ${maxLimit}.`
    );
  }
  const rawAfterPosition = url.searchParams.get("afterPosition");
  const rawCursorId = url.searchParams.get(cursorId);
  if ((rawAfterPosition == null) !== (rawCursorId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      `afterPosition e ${cursorId} devem ser informados juntos.`
    );
  }
  let cursor = {};
  if (rawAfterPosition != null) {
    const afterPosition = Number(rawAfterPosition);
    if (!Number.isSafeInteger(afterPosition) || afterPosition < 0) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "afterPosition deve ser um inteiro não negativo."
      );
    }
    cursor = {
      afterPosition,
      [cursorId]: validateRunId(rawCursorId)
    };
  }
  if (!query) return { limit, ...cursor };
  const normalizedQuery = String(url.searchParams.get("query") || "").trim();
  if (normalizedQuery.length > 160) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "query deve ter no máximo 160 caracteres."
    );
  }
  return { limit, query: normalizedQuery, ...cursor };
}

function personalStructureQuery(request) {
  const url = new URL(request.url);
  const section = String(url.searchParams.get("section") || "modules").trim();
  if (!new Set(["modules", "lessons", "microsequences", "cards"]).has(section)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "section deve ser modules, lessons, microsequences ou cards."
    );
  }
  const parentSource = url.searchParams.get("parentId");
  const parentId = parentSource == null || parentSource === ""
    ? null
    : validateRunId(parentSource);
  if ((section === "modules") !== (parentId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      section === "modules"
        ? "Módulos não recebem parentId."
        : `${section} exige parentId.`
    );
  }
  return {
    section,
    parentId,
    ...personalLibraryPagination(request, {
      maxLimit: 200,
      cursorId: "afterId"
    })
  };
}

export async function executeAuthoringRoute({
  request,
  route,
  adapter,
  principal,
  deadlineAt = null,
  receiptSecret,
  receiptClock
}) {
  if (deadlineAt != null) {
    const baseAdapter = adapter;
    adapter = new Proxy(baseAdapter, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (options = {}) => value.call(target, { ...options, deadlineAt });
      }
    });
  }
  if (route.name === "listPrivateIntegrations") {
    assertAuthenticatedSession(principal);
    return {
      data: await adapter.listPrivateIntegrations({ principal }),
      requestId: null
    };
  }
  if (route.name === "listAuthoringResources") {
    assertAuthoringScope(principal, "read");
    return {
      data: {
        contract: AUTHORING_RESOURCE_CONTRACT_VERSION,
        resources: listAuthoringResourceContracts()
      },
      requestId: null
    };
  }
  if (route.name === "getAuthoringResource") {
    assertAuthoringScope(principal, "read");
    const resource = getAuthoringResourceContract(route.resource);
    if (!resource) {
      throw new AuthoringApiError(
        404,
        "resource_not_found",
        "Recurso de card inexistente."
      );
    }
    return {
      data: {
        contract: AUTHORING_RESOURCE_CONTRACT_VERSION,
        definition: resource
      },
      requestId: null
    };
  }
  if (route.name === "createPrivateIntegration") {
    assertAuthenticatedSession(principal);
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    const payload = validateCreatePrivateIntegrationPayload(rawPayload);
    reconcileRequestId(request, payload);
    return {
      data: await adapter.createPrivateIntegration({ principal, ...payload }),
      requestId: payload.requestId
    };
  }
  if (route.name === "rotatePrivateIntegration") {
    assertAuthenticatedSession(principal);
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    const payload = validateRotatePrivateIntegrationPayload(rawPayload);
    reconcileRequestId(request, payload);
    return {
      data: await adapter.rotatePrivateIntegration({
        principal,
        clientId: route.clientId,
        ...payload
      }),
      requestId: payload.requestId
    };
  }
  if (route.name === "revokePrivateIntegration") {
    assertAuthenticatedSession(principal);
    return {
      data: await adapter.revokePrivateIntegration({
        principal,
        clientId: route.clientId
      }),
      requestId: null
    };
  }
  if (route.name === "listPersonalLibraryCourses") {
    assertAuthoringScope(principal, "read", "private");
    const data = await adapter.listPersonalLibraryCourses({
      principal,
      ...personalLibraryPagination(request, {
        cursorId: "afterSelectionId",
        query: true
      })
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "personal_library_list_too_large",
          "A lista da biblioteca excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (new Set(["listCatalogSubmissionCandidates", "listMyCatalogSubmissions"]).has(route.name)) {
    assertAuthoringScope(principal, "read", "private");
    const data = route.name === "listCatalogSubmissionCandidates"
      ? await adapter.listCatalogSubmissionCandidates({ principal })
      : await adapter.listMyCatalogSubmissions({ principal });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(data, "catalog_submission_list_too_large", "A lista de ofertas excede 90 KiB.")
        : data,
      requestId: null
    };
  }
  if (route.name === "listCatalogSubmissionQueue") {
    assertScope(principal, "catalog:publish");
    const data = await adapter.listCatalogSubmissionQueue({ principal });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(data, "catalog_submission_queue_too_large", "A fila editorial excede 90 KiB.")
        : data,
      requestId: null
    };
  }
  if (new Set(["submitCatalogSubmission", "withdrawCatalogSubmission"]).has(route.name)) {
    assertAuthoringScope(principal, "write", "private");
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    const payload = route.name === "submitCatalogSubmission"
      ? validateCatalogSubmissionPayload(rawPayload)
      : validateWithdrawCatalogSubmissionPayload(rawPayload);
    reconcileRequestId(request, payload);
    const data = route.name === "submitCatalogSubmission"
      ? await adapter.submitCatalogSubmission({ principal, ...payload })
      : await adapter.withdrawCatalogSubmission({ principal, submissionId: route.submissionId, ...payload });
    return { data, requestId: payload.requestId };
  }
  if (new Set(["startCatalogSubmissionReview", "decideCatalogSubmission"]).has(route.name)) {
    assertScope(principal, "catalog:publish");
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    const payload = route.name === "decideCatalogSubmission"
      ? validateCatalogSubmissionDecisionPayload(rawPayload)
      : validateWithdrawCatalogSubmissionPayload(rawPayload);
    reconcileRequestId(request, payload);
    const data = route.name === "decideCatalogSubmission"
      ? await adapter.decideCatalogSubmission({ principal, submissionId: route.submissionId, ...payload })
      : await adapter.startCatalogSubmissionReview({ principal, submissionId: route.submissionId, ...payload });
    return { data, requestId: payload.requestId };
  }
  if (route.name === "getPersonalLibraryCourseStructure") {
    assertAuthoringScope(principal, "read", "private");
    const data = await adapter.getPersonalLibraryCourseStructure({
      principal,
      courseId: route.courseId,
      ...personalStructureQuery(request)
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "personal_course_structure_too_large",
          "A estrutura do curso excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (route.name === "listPersonalStudyPaths") {
    assertAuthoringScope(principal, "read", "private");
    const data = await adapter.listPersonalStudyPaths({
      principal,
      ...personalLibraryPagination(request, {
        cursorId: "afterPathId"
      })
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "personal_path_list_too_large",
          "A lista de trilhas excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (new Set([
    "renamePersonalLibraryCourse",
    "createPersonalStudyPath",
    "renamePersonalStudyPath",
    "deletePersonalStudyPath",
    "movePersonalCourseSelection"
  ]).has(route.name)) {
    assertAuthoringScope(principal, "write", "private");
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    let payload;
    let data;
    switch (route.name) {
      case "renamePersonalLibraryCourse":
        payload = validateRenamePersonalLibraryCoursePayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.renamePersonalLibraryCourse({
          principal,
          courseId: route.courseId,
          ...payload
        });
        break;
      case "createPersonalStudyPath":
        payload = validateCreatePersonalStudyPathPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.createPersonalStudyPath({ principal, ...payload });
        break;
      case "renamePersonalStudyPath":
        payload = validateRenamePersonalStudyPathPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.renamePersonalStudyPath({
          principal,
          pathId: route.pathId,
          ...payload
        });
        break;
      case "deletePersonalStudyPath":
        payload = validateDeletePersonalStudyPathPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.deletePersonalStudyPath({
          principal,
          pathId: route.pathId,
          ...payload
        });
        break;
      case "movePersonalCourseSelection":
        payload = validateMovePersonalCourseSelectionPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.movePersonalCourseSelection({
          principal,
          selectionId: route.selectionId,
          ...payload
        });
        break;
      default:
        throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
    }
    return { data, requestId: payload.requestId };
  }
  if (new Set([
    "openCourseRevision",
    "getCourseRevision",
    "getCourseRevisionFragment",
    "saveCourseRevisionPatch",
    "applyCourseRevision"
  ]).has(route.name)) {
    if (route.target === "catalog") {
      assertScope(principal, "catalog:publish");
    } else {
      assertAuthoringScope(principal, "write", "private");
    }
    const assertTarget = (revision) => {
      if (revision?.target !== route.target) {
        throw new AuthoringApiError(
          404,
          "revision_not_found",
          "A correção solicitada não pertence a este destino."
        );
      }
      return revision;
    };
    if (route.name === "openCourseRevision") {
      const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
      const payload = validateOpenCourseRevisionPayload(rawPayload);
      reconcileRequestId(request, payload);
      const revisionId = await deterministicRequestUuid(
        `${principal.actorId}:course-revision:${route.target}:${payload.requestId}`
      );
      let resolvedTarget = {
        courseId: payload.courseId,
        microsequenceId: payload.microsequenceId,
        cardId: payload.cardId
      };
      if (route.target === "private") {
        const mutationId = await deterministicRequestUuid(
          `${revisionId}:private-copy-on-write`
        );
        resolvedTarget = await adapter.resolvePrivateCourseRevisionTarget({
          principal,
          mutationId,
          courseId: payload.courseId,
          microsequenceId: payload.microsequenceId,
          cardId: payload.cardId
        });
      }
      const opened = assertTarget(await adapter.openCourseRevision({
        principal,
        revisionId,
        target: route.target,
        courseId: resolvedTarget.courseId,
        microsequenceId: resolvedTarget.microsequenceId,
        cardId: resolvedTarget.cardId
      }));
      return {
        data: route.target === "private"
          ? {
            ...opened,
            sourceCourseId: resolvedTarget.sourceCourseId || null,
            selectionId: resolvedTarget.selectionId || null,
            forked: Boolean(resolvedTarget.forked)
          }
          : opened,
        requestId: payload.requestId
      };
    }
    if (route.name === "getCourseRevision") {
      return {
        data: assertTarget(await adapter.getCourseRevision({
          principal,
          revisionId: route.revisionId
        })),
        requestId: null
      };
    }
    if (route.name === "getCourseRevisionFragment") {
      const rawFragment = assertTarget(await adapter.getCourseRevisionFragment({
        principal,
        revisionId: route.revisionId
      }));
      const data = buildCourseContentRevisionFragment(rawFragment);
      return {
        data: principal.authenticationKind === "api_key"
          ? assertActionResponseBudget(
            data,
            "revision_fragment_too_large",
            "O fragmento formal excede 90 KiB."
          )
          : data,
        requestId: null
      };
    }
    if (route.name === "saveCourseRevisionPatch") {
      const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
      const payload = validateSaveCourseRevisionPayload(rawPayload);
      reconcileRequestId(request, payload);
      const currentFragmentPayload = assertTarget(
        await adapter.getCourseRevisionFragment({
          principal,
          revisionId: route.revisionId
        })
      );
      const fullDocumentRows = await adapter.getCourseRevisionDocumentRows({
        principal,
        revisionId: route.revisionId
      });
      const prepared = await prepareCourseContentRevision({
        formalFragment: payload.authoringFragment,
        compiledFragment: payload.compiledFragment,
        currentFragmentPayload,
        fullDocumentRows
      });
      return {
        data: await adapter.saveCourseRevisionPatch({
          principal,
          revisionId: route.revisionId,
          requestId: payload.requestId,
          baseContentHash: payload.baseContentHash,
          authoringFragment: payload.authoringFragment,
          compiledFragment: payload.compiledFragment,
          relationalPatch: prepared.relationalPatch,
          scopedDiff: prepared.diff,
          expectedContentHash: prepared.expectedContentHash
        }),
        requestId: payload.requestId
      };
    }
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    const payload = validateApplyCourseRevisionPayload(rawPayload);
    reconcileRequestId(request, payload);
    return {
      data: await adapter.applyCourseRevision({
        principal,
        revisionId: route.revisionId,
        requestId: payload.requestId,
        baseContentHash: payload.baseContentHash
      }),
      requestId: payload.requestId
    };
  }
  if (route.name === "listCatalogCollections") {
    assertScope(principal, "catalog:publish");
    const data = await adapter.listCatalogCollections({
      principal,
      ...catalogPagination(request, { retired: true })
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "catalog_list_too_large",
          "A lista de coleções excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (route.name === "listCatalogCourses") {
    assertScope(principal, "catalog:publish");
    const data = await adapter.listCatalogCourses({
      principal,
      collectionId: route.collectionId,
      ...catalogPagination(request)
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "catalog_list_too_large",
          "A lista de cursos excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (route.name === "getCatalogCourse") {
    assertScope(principal, "catalog:publish");
    const data = await adapter.getCatalogCourse({
      principal,
      courseId: route.courseId
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "catalog_course_too_large",
          "A consulta do curso excede 90 KiB."
        )
        : data,
      requestId: null
    };
  }
  if (route.name === "getCatalogCourseStructure") {
    assertScope(principal, "catalog:publish");
    const data = await adapter.getCatalogCourseStructure({
      principal,
      courseId: route.courseId,
      ...catalogStructurePagination(request)
    });
    return {
      data: principal.authenticationKind === "api_key"
        ? assertActionResponseBudget(
          data,
          "catalog_structure_page_too_large",
          "A página da estrutura excede 90 KiB. Use um limite menor."
        )
        : data,
      requestId: null
    };
  }
  if (new Set([
    "createCatalogCollection",
    "renameCatalogCollection",
    "retireCatalogCollection",
    "reorderCatalogCollections",
    "moveCatalogCourse",
    "reorderCatalogCourses",
    "updateCatalogCourse"
  ]).has(route.name)) {
    assertScope(principal, "catalog:publish");
    const rawPayload = await readJsonBody(request, STANDARD_BODY_LIMIT);
    let payload;
    let data;
    switch (route.name) {
      case "createCatalogCollection":
        payload = validateCreateCatalogCollectionPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.createCatalogCollection({ principal, ...payload });
        break;
      case "renameCatalogCollection":
        payload = validateRenameCatalogCollectionPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.renameCatalogCollection({
          principal,
          collectionId: route.collectionId,
          ...payload
        });
        break;
      case "retireCatalogCollection":
        payload = validateRetireCatalogCollectionPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.retireCatalogCollection({
          principal,
          collectionId: route.collectionId,
          ...payload
        });
        break;
      case "reorderCatalogCollections":
        payload = validateReorderCatalogCollectionsPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.reorderCatalogCollections({ principal, ...payload });
        break;
      case "moveCatalogCourse":
        payload = validateMoveCatalogCoursePayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.moveCatalogCourse({
          principal,
          courseId: route.courseId,
          ...payload
        });
        break;
      case "reorderCatalogCourses":
        payload = validateReorderCatalogCoursesPayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.reorderCatalogCourses({
          principal,
          collectionId: route.collectionId,
          ...payload
        });
        break;
      case "updateCatalogCourse":
        payload = validateUpdateCatalogCoursePayload(rawPayload);
        reconcileRequestId(request, payload);
        data = await adapter.updateCatalogCourseMetadata({
          principal,
          courseId: route.courseId,
          ...payload
        });
        break;
      default:
        throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
    }
    return { data, requestId: payload.requestId };
  }
  if (route.name === "listRuns") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit == null || rawLimit === "" ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AuthoringApiError(422, "invalid_pagination", "limit deve ser um inteiro entre 1 e 100.");
    }
    const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
    const beforeRunId = url.searchParams.get("beforeRunId");
    if ((beforeUpdatedAt == null) !== (beforeRunId == null)) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "beforeUpdatedAt e beforeRunId devem ser informados juntos."
      );
    }
    let cursor = null;
    if (beforeUpdatedAt != null) {
      const parsed = new Date(beforeUpdatedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new AuthoringApiError(422, "invalid_pagination", "beforeUpdatedAt deve usar ISO UTC.");
      }
      cursor = {
        beforeUpdatedAt: parsed.toISOString(),
        beforeRunId: validateRunId(beforeRunId)
      };
    }
    let data = await adapter.listRuns({ principal, limit, ...cursor });
    if (principal.authenticationKind === "api_key") {
      data = assertActionResponseBudget(
        data,
        "run_list_too_large",
        "A lista excede 90 KiB. Use um limite menor e continue pela paginação."
      );
    }
    return {
      data,
      requestId: null
    };
  }

  if (route.name === "getRun" || route.name === "nextPart" || route.name === "getPartSubmission") {
    // A execução já informa se pertence ao catálogo ou à biblioteca privada.
    // Não use a exigência genérica aqui: uma chave pessoal possui somente
    // authoring:private:read e precisa poder retomar sua própria execução.
    await authorizeExistingRun(adapter, {
      principal,
      runId: route.runId,
      action: "read"
    });
    if (route.name === "getPartSubmission") {
      const submission = await adapter.getPartSubmission({
        principal,
        runId: route.runId,
        partKey: route.partKey
      });
      const submissionReadReceipt = await issueSubmissionReadReceipt({
        secret: receiptSecret,
        principal,
        runId: route.runId,
        partKey: route.partKey,
        attempt: submission?.attempt,
        submissionSha256: submission?.fragmentHash,
        nowMs: receiptClock()
      });
      const provenSubmission = { ...submission, submissionReadReceipt };
      return {
        data: principal.authenticationKind === "api_key"
          ? assertActionResponseBudget(
            provenSubmission,
            "submission_context_too_large",
            "A entrega excede 90 KiB. Reduza a parte antes de solicitar auditoria."
          )
          : provenSubmission,
        requestId: null
      };
    }
    const args = { principal, runId: route.runId };
    const run = route.name === "nextPart"
      ? await readNextPartState(adapter, args)
      : await readRunSummary(adapter, args);
    let data = route.name === "nextPart" ? await buildNextPart(run) : run;
    if (principal.authenticationKind === "api_key") {
      if (route.name === "getRun") data = compactActionRunSummary(data);
      data = assertActionResponseBudget(
        data,
        route.name === "nextPart" ? "part_context_too_large" : "run_summary_too_large",
        route.name === "nextPart"
          ? "O contexto da parte excede 90 KiB. Divida a parte e crie um novo plano."
          : "O resumo da execução excede 90 KiB. Reduza a quantidade de partes do plano."
      );
    }
    return {
      data,
      requestId: null
    };
  }

  // Autoriza a operação antes de interpretar um documento grande. Assim,
  // clientes sem permissão recebem sempre a mesma resposta e não usam a
  // validação do contrato como serviço lateral.
  if (route.name === "importDocument") {
    if (principal.clientId || principal.authenticationKind === "api_key") {
      throw new AuthoringApiError(
        403,
        "manual_import_requires_session",
        "A importação manual exige uma sessão de usuário autorizada."
      );
    }
    assertScope(principal, "course:import");
    assertScope(principal, "catalog:publish");
  }
  const existingRunAction = EXISTING_RUN_MUTATION_ACTIONS.get(route.name);
  if (existingRunAction) {
    assertPotentialExistingRunScope(principal, existingRunAction);
  }

  const limit = route.name === "importDocument"
    ? MANUAL_IMPORT_BODY_LIMIT
    : route.name === "putLedgerChunk"
      ? LEDGER_CHUNK_BODY_LIMIT
    : route.name === "setPlan"
      ? (principal.authenticationKind === "api_key" ? ACTION_PLAN_BODY_LIMIT : PLAN_BODY_LIMIT)
      : STANDARD_BODY_LIMIT;
  const rawPayload = await readJsonBody(request, limit);
  let preflightReplay;
  let authorizedRun = null;
  if (existingRunAction) {
    try {
      authorizedRun = await authorizeExistingRun(adapter, {
        principal,
        runId: route.runId,
        action: existingRunAction
      });
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const mayHaveRetainedReceipt = REPLAYABLE_EXISTING_RUN_ROUTES.has(route.name)
        && new Set(["run_not_found", "not_authorized"]).has(normalized.code);
      if (!mayHaveRetainedReceipt) throw error;
      preflightReplay = await replayCommandBeforeDetailedValidation(
        adapter,
        request,
        { principal, rawPayload, action: existingRunAction }
      );
      if (preflightReplay == null) throw error;
    }
  }
  let payload;
  switch (route.name) {
    case "createRun":
      payload = validateCreateRunPayload(rawPayload);
      assertAuthoringScope(principal, "write", payload.target);
      reconcileRequestId(request, payload);
      {
        const runId = await deterministicRequestUuid(
          `${principal.actorId}:run:${payload.requestId}`
        );
        return {
          data: await adapter.command({
            principal,
            runId,
            requestId: payload.requestId,
            command: "create_run",
            payload: await commandPayload(request, rawPayload, {
              publicationTarget: payload.target,
              collectionId: payload.collectionId,
              contractKey: payload.contractKey,
              title: payload.title,
              brief: payload.brief,
              publicationIntent: payload.publicationIntent
            })
          }),
          requestId: payload.requestId
        };
      }
    case "setPlan":
      {
        if (preflightReplay) {
          return {
            data: preflightReplay,
            requestId: rawPayload.requestId
          };
        }
        // O identificador estável do curso nasce na criação da execução. A
        // validação antecipada evita que uma divergência chegue ao banco como
        // uma violação genérica de constraint, sem orientação para a Action.
        payload = validatePlanPayload(rawPayload, {
          runId: route.runId,
          contractKey: authorizedRun.contractKey
        });
      }
      reconcileRequestId(request, payload);
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        requestId: payload.requestId,
        command: "set_plan",
        payload: await commandPayload(request, rawPayload, { plan: payload.plan })
      }), requestId: payload.requestId };
    case "putLedgerChunk":
      payload = validateLedgerChunkPayload(rawPayload, route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "put_ledger_chunk",
            payload: await commandPayload(request, rawPayload, {
              planHash: payload.planHash,
              section: route.section,
              position: route.position,
              items: payload.items
            })
          }),
          requestId: payload.requestId
        };
      }
    case "finalizePlan":
      payload = validateFinalizePlanPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) {
          return {
            data: await attachPersistedNextPart(
              adapter,
              principal,
              route.runId,
              replayed
            ),
            requestId: payload.requestId
          };
        }
        const result = await adapter.command({
          principal,
          runId: route.runId,
          requestId: payload.requestId,
          command: "finalize_plan",
          payload: await commandPayload(request, rawPayload, { planHash: payload.planHash })
        });
        return {
          data: await attachPersistedNextPart(
            adapter,
            principal,
            route.runId,
            result
          ),
          requestId: payload.requestId
        };
      }
    case "setPartSpecification":
      {
        const envelope = validatePartSpecificationEnvelope(rawPayload);
        reconcileRequestId(request, envelope);
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: envelope.requestId, rawPayload
        });
        if (replayed) {
          return {
            data: await attachPersistedNextPart(
              adapter,
              principal,
              route.runId,
              replayed
            ),
            requestId: envelope.requestId
          };
        }
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        payload = validatePartSpecificationPayload(rawPayload, route, run);
        reconcileRequestId(request, payload);
        const result = await adapter.command({
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "set_part_specification",
          payload: await commandPayload(request, rawPayload, {
            planHash: payload.planHash,
            specification: payload.specification
          })
        });
        return {
          data: await attachPersistedNextPart(
            adapter,
            principal,
            route.runId,
            result
          ),
          requestId: payload.requestId
        };
      }
    case "submitPart":
      payload = validatePartPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) {
          return {
            data: attachNextAction(
              replayed,
              nextActionReference(route.runId, "read_submission", route.partKey),
              principal,
              route.runId
            ),
            requestId: payload.requestId
          };
        }
        const command = {
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "submit_part",
          payload: await commandPayload(request, rawPayload, {
            mode: payload.mode,
            expectedAttempt: payload.attempt,
            baseLedgerSha256: payload.baseLedgerSha256,
            fragment: payload.fragment,
            authoringFragment: payload.authoringFragment,
            evidence: payload.evidence,
            stateDelta: payload.stateDelta
          })
        };
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        const current = Array.isArray(run?.parts)
          ? run.parts.find((part) => part?.partKey === route.partKey)
          : null;
        if (current?.status === "awaiting_audit" && current.attempt === payload.attempt) {
          try {
            const result = await adapter.command(command);
            return {
              data: attachNextAction(
                result,
                nextActionReference(route.runId, "read_submission", route.partKey),
                principal,
                route.runId
              ),
              requestId: payload.requestId
            };
          } catch (error) {
            if (error instanceof AuthoringApiError && error.code === "invalid_state") {
              throw new AuthoringApiError(409, "stale_part_spec", "A parte já recebeu outra submissão.");
            }
            throw error;
          }
        }
        const expected = await buildNextPart(run);
        if (!expected || expected.partKey !== route.partKey
            || expected.attempt !== payload.attempt
            || expected.baseLedgerSha256 !== payload.baseLedgerSha256) {
          throw new AuthoringApiError(
            409,
            "stale_part_spec",
            "A especificação da parte foi substituída. Consulte a próxima parte novamente."
          );
        }
        assertFragmentMatchesSpecification(payload.fragment, expected);
        assertSubmissionMatchesContinuity(payload, expected);
        if (payload.mode === "repair") {
          const previous = await adapter.getPartSubmission({
            principal,
            runId: route.runId,
            partKey: route.partKey
          });
          // A lista `specification.preserve` protege a própria especificação,
          // que já é imutável neste ponto e é conferida por
          // assertFragmentMatchesSpecification. Ela pode conter caminhos como
          // /key e /cardPlan, inexistentes no fragmento submetido. Somente os
          // campos pedidos pelo auditor precisam ser comparados entre tentativas.
          const preservePointers = Array.isArray(expected?.previousAudit?.findings)
            ? expected.previousAudit.findings.flatMap((finding) =>
              Array.isArray(finding?.preserveFields) ? finding.preserveFields : [])
            : [];
          if (!previous.authoringFragment || !payload.authoringFragment) {
            throw new AuthoringApiError(
              409,
              "missing_authoring_fragment",
              "O reparo exige o fragmento formal da submissão."
            );
          }
          assertPreservedPointers(
            previous.authoringFragment,
            payload.authoringFragment,
            preservePointers
          );
        }
        const result = await adapter.command(command);
        return {
          data: attachNextAction(
            result,
            nextActionReference(route.runId, "read_submission", route.partKey),
            principal,
            route.runId
          ),
          requestId: payload.requestId
        };
      }
    case "auditPart":
      payload = validateAuditPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) {
          return {
            data: await attachPersistedNextPart(
              adapter,
              principal,
              route.runId,
              replayed
            ),
            requestId: payload.requestId
          };
        }
        await verifySubmissionReadReceipt(payload.submissionReadReceipt, {
          secret: receiptSecret,
          principal,
          runId: route.runId,
          partKey: route.partKey,
          attempt: payload.attempt,
          submissionSha256: payload.submissionSha256,
          nowMs: receiptClock()
        });
        const command = {
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "audit_part",
          payload: await commandPayload(request, rawPayload, {
            expectedAttempt: payload.attempt,
            submissionSha256: payload.submissionSha256,
            decision: payload.decision,
            gates: payload.gates,
            findings: payload.findings,
            instructions: payload.instructions
          })
        };
        const run = await readNextPartState(adapter, {
          principal,
          runId: route.runId
        });
        const submitted = Array.isArray(run?.parts)
          ? run.parts.find((part) => part?.partKey === route.partKey)
          : null;
        if (submitted && submitted.status !== "awaiting_audit"
            && submitted.attempt === payload.attempt) {
          try {
            const result = await adapter.command(command);
            return {
              data: await attachPersistedNextPart(
                adapter,
                principal,
                route.runId,
                result
              ),
              requestId: payload.requestId
            };
          } catch (error) {
            if (error instanceof AuthoringApiError && error.code === "invalid_state") {
              throw new AuthoringApiError(409, "stale_submission", "A submissão já recebeu outra auditoria.");
            }
            throw error;
          }
        }
        if (!submitted || submitted.status !== "awaiting_audit"
            || submitted.attempt !== payload.attempt
            || submitted.fragmentHash !== payload.submissionSha256) {
          throw new AuthoringApiError(
            409,
            "stale_submission",
            "A submissão foi substituída. Consulte a execução antes de auditar novamente."
          );
        }
        const result = await adapter.command(command);
        return {
          data: await attachPersistedNextPart(
            adapter,
            principal,
            route.runId,
            result
          ),
          requestId: payload.requestId
        };
      }
    case "reopenPart":
      payload = validateReopenPartPayload(withRoutePartIdentity(rawPayload, route), route);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) {
          return {
            data: await attachPersistedNextPart(
              adapter,
              principal,
              route.runId,
              replayed
            ),
            requestId: payload.requestId
          };
        }
        const result = await adapter.command({
          principal,
          runId: route.runId,
          partKey: route.partKey,
          requestId: payload.requestId,
          command: "reopen_part",
          payload: await commandPayload(request, rawPayload, {
            expectedAttempt: payload.attempt,
            submissionSha256: payload.submissionSha256,
            decision: payload.decision,
            findings: payload.findings,
            instructions: payload.instructions
          })
        });
        return {
          data: await attachPersistedNextPart(
            adapter,
            principal,
            route.runId,
            result
          ),
          requestId: payload.requestId
        };
      }
    case "validateRun":
      payload = validateSimpleCommandPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload,
          requiredScope: "authoring:audit"
        });
        if (replayed) {
          return {
            data: attachNextAction(
              replayed,
              nextActionReference(route.runId, "prepare_publish"),
              principal,
              route.runId
            ),
            requestId: payload.requestId
          };
        }
        const run = await adapter.getRun({ principal, runId: route.runId });
        let prepared;
        try {
          const document = assembleAuthoringRun(run);
          prepared = await prepareCourseDocument(document, { requireReady: true });
        } catch (error) {
          const normalized = asAuthoringApiError(error);
          throw new AuthoringApiError(
            normalized.status,
            normalized.code,
            normalized.message,
            {
              ...(normalized.details && typeof normalized.details === "object"
                ? compactErrorDetails(normalized.details)
                : {}),
              recovery: {
                method: "POST",
                pathTemplate: `/v1/runs/${route.runId}/parts/{partKey}/reopen`,
                decisions: ["repair", "rebuild"]
              }
            }
          );
        }
        const result = await adapter.command({
          principal,
          runId: route.runId,
          requestId: payload.requestId,
          command: "validate",
          payload: await commandPayload(request, rawPayload, {
            expectedRevision: run.revision,
            valid: true,
            documentHash: prepared.contentHash,
            document: prepared.document,
            validation: {
              valid: true,
              contract: "aralearn.contract",
              version: 3
            }
          })
        });
        return {
          data: attachNextAction(
            result,
            nextActionReference(route.runId, "prepare_publish"),
            principal,
            route.runId
          ),
          requestId: payload.requestId
        };
      }
    case "publishRun":
      payload = validateSimpleCommandPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const data = await adapter.publishRun({
          principal,
          runId: route.runId,
          requestId: payload.requestId,
          deadlineAt
        });
        return {
          data,
          requestId: payload.requestId,
          httpStatus: data?.status === "publishing" ? 202 : 200
        };
      }
    case "cancelRun":
      payload = validateCancelRunPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
        return {
          data: await adapter.command({
            principal,
            runId: route.runId,
            requestId: payload.requestId,
            command: "cancel_run",
            payload: await commandPayload(request, rawPayload, { reason: payload.reason })
          }),
          requestId: payload.requestId
        };
      }
    case "blockRun":
      payload = validateBlockPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        partKey: payload.partKey,
        requestId: payload.requestId,
        command: "block",
        payload: await commandPayload(request, rawPayload, {
          reason: payload.reason, questions: payload.questions
        })
      }), requestId: payload.requestId };
      }
    case "resumeRun":
      payload = validateResumePayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const replayed = await replayCommandOnce(preflightReplay, adapter, request, {
          principal, requestId: payload.requestId, rawPayload
        });
        if (replayed) return { data: replayed, requestId: payload.requestId };
      return { data: await adapter.command({
        principal,
        runId: route.runId,
        requestId: payload.requestId,
        command: "resume",
        payload: await commandPayload(request, rawPayload, { resolution: payload.resolution })
      }), requestId: payload.requestId };
      }
    case "importDocument":
      payload = validateImportPayload(rawPayload);
      reconcileRequestId(request, payload);
      {
        const prepared = await prepareCourseDocument(
          payload.document, { official: true, requireReady: true }
        );
      return {
        data: await adapter.importDocument({
          principal,
          ...payload,
          prepared,
          apiRequestHash: await apiRequestHash(request, rawPayload)
        }),
        requestId: payload.requestId
      };
      }
    default:
      throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
  }
}

export function createAuthoringHandler({
  adapter,
  allowedOrigins = new Set(),
  receiptSecret = adapter?.receiptSecret || adapter?.serverApiKey,
  receiptClock = () => Date.now()
}) {
  if (!adapter) throw new TypeError("O handler de autoria exige um adaptador.");
  if (typeof receiptClock !== "function") throw new TypeError("receiptClock deve ser uma função.");
  return async function handleAuthoringRequest(request) {
    let headers = { Vary: "Origin" };
    const traceId = globalThis.crypto?.randomUUID?.() || `trace-${Date.now()}`;
    // Chamadas mutáveis da autoria são idempotentes. Mais tentativas curtas
    // toleram uma oscilação do PostgREST sem fazer a Action perder o trabalho
    // de planejamento já mantido na própria execução.
    const deadlineAt = Date.now() + 50_000;
    try {
      if (request.method === "OPTIONS") {
        headers = preflightHeaders(request, allowedOrigins);
        return new Response(null, { status: 204, headers });
      }
      headers = corsHeaders(request, allowedOrigins);
      const url = new URL(request.url);
      const route = routeRequest(request.method, url.pathname);
      const authentication = readAuthorization(request);
      const principal = await adapter.resolvePrincipal(authentication, { deadlineAt });
      const result = await executeAuthoringRoute({
        request,
        route,
        adapter,
        principal,
        deadlineAt,
        receiptSecret,
        receiptClock
      });
      const requestId = requestIdFromHeaders(request) || result.requestId || traceId;
      return jsonResponse(
        result.httpStatus || 200,
        responseBody(true, requestId, result.data),
        headers
      );
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      if (normalized.status === 429 || normalized.status >= 500) {
        headers = { ...headers, "Retry-After": normalized.status === 429 ? "60" : "1" };
      }
      const compactDetails = compactErrorDetails(normalized.details);
      const details = compactDetails === undefined ? {} : { details: compactDetails };
      return jsonResponse(
        normalized.status,
        responseBody(false, requestIdFromHeaders(request) || traceId, {
          code: normalized.code,
          message: normalized.message,
          ...details
        }),
        headers
      );
    }
  };
}
