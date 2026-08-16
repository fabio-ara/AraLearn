import { deterministicRequestUuid } from "./canonical.js";
import {
  executeWorkspaceDesignAction,
  validateWorkspaceCardDesignAccess
} from "./authoringDesignService.js";
import {
  executeExperimentEnrollmentAction,
  executeWorkspaceExperimentAction
} from "./authoringExperimentService.js";
import { AuthoringApiError } from "./errors.js";
import {
  STANDARD_BODY_LIMIT,
  readJsonBody,
  validateUuid
} from "./protocol.js";
import { assertScope } from "./security.js";
import {
  validateCreateCatalogCollectionPayload,
  validateCreateWorkspacePayload,
  validateCatalogReviewCommandPayload,
  validateCatalogReviewDecisionPayload,
  validateCreateReviewWorkspacePayload,
  validateDeleteWorkspacePayload,
  validateEducationalWorkspaceActionPayload,
  validateEducationalWorkspaceCommentActionPayload,
  validateExperimentEnrollmentActionPayload,
  validateWorkspaceObservationActionPayload,
  validateMoveCatalogCoursePayload,
  validateRemovePersonalLibraryCoursePayload,
  validateRemoveCatalogCoursePayload,
  validateRetireCatalogCollectionPayload,
  validateSubmitCatalogReviewPayload,
  validateUpdateCatalogCollectionPayload,
  validateWorkspaceContinuityActionPayload,
  validateWorkspaceDesignActionPayload,
  validateWorkspaceExperimentActionPayload,
  validateWorkspaceImportPayload,
  validateWorkspaceMutationPayload,
  validateWorkspacePublishPayload,
  WORKSPACE_DESIGN_ACTION_BODY_LIMIT,
  WORKSPACE_EXPERIMENT_ACTION_BODY_LIMIT,
  EXPERIMENT_ENROLLMENT_ACTION_BODY_LIMIT,
  workspaceEntityType,
  workspaceUuid
} from "./workspaceProtocol.js";

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

function scopes(principal) {
  return new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
}

function assertAuthoringScope(principal, action, target = null) {
  const available = scopes(principal);
  const required = target === "private"
    ? [`authoring:private:${action}`]
    : [`authoring:${action}`, `authoring:private:${action}`];
  if (available.has("*") || required.some((scope) => available.has(scope))) return;
  throw new AuthoringApiError(
    403,
    "insufficient_scope",
    "A sessão OAuth não permite esta operação de autoria."
  );
}

function positiveLimit(request, fallback = 50, maximum = 100) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new AuthoringApiError(422, "invalid_pagination", `limit deve ficar entre 1 e ${maximum}.`);
  }
  return limit;
}

function entityPathFromUrl(url, field = "entityPath") {
  const raw = url.searchParams.get(field);
  if (raw == null) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AuthoringApiError(422, "invalid_workspace_entity_path", `${field} não contém JSON válido.`);
  }
  if (!Array.isArray(value)
      || value.length < 1
      || value.length > 5
      || value.some((id) => typeof id !== "string" || !id.trim() || id.length > 240)) {
    throw new AuthoringApiError(
      422,
      "invalid_workspace_entity_path",
      `${field} deve conter de um a cinco ids.`
    );
  }
  return value.map((id) => id.trim());
}

function boundedStringList(url, field, allowed, maximum) {
  const raw = url.searchParams.get(field);
  if (raw == null) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AuthoringApiError(422, "invalid_pagination", `${field} não contém JSON válido.`);
  }
  if (!Array.isArray(value) || value.length > maximum ||
      new Set(value).size !== value.length || value.some((item) => !allowed.has(item))) {
    throw new AuthoringApiError(422, "invalid_pagination", `${field} é inválido.`);
  }
  return value;
}

function validRfc3339DateTime(value) {
  const match = String(value || "").match(
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
  );
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  return Boolean(match)
    && Number.isFinite(Date.parse(value))
    && calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day;
}

function workspaceCommentPagination(request) {
  const url = new URL(request.url);
  const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
  const beforeId = url.searchParams.get("beforeId");
  if ((beforeUpdatedAt == null) !== (beforeId == null)) {
    throw new AuthoringApiError(
      422, "invalid_pagination", "beforeUpdatedAt e beforeId devem ser usados juntos."
    );
  }
  if (beforeUpdatedAt != null && !validRfc3339DateTime(beforeUpdatedAt)) {
    throw new AuthoringApiError(
      422, "invalid_pagination", "beforeUpdatedAt deve usar data e hora RFC 3339 válida."
    );
  }
  return {
    limit: positiveLimit(request, 20, 50),
    beforeUpdatedAt,
    beforeId: beforeId == null ? null : validateUuid(beforeId),
    categories: boundedStringList(url, "categories", new Set([
      "question", "possible_error", "confusing", "suggestion", "observation"
    ]), 5),
    statuses: boundedStringList(url, "statuses", new Set([
      "open", "considered", "resolved", "incorporated"
    ]), 4)
  };
}

function identityPagination(request, cursorId, { query = false, retired = false } = {}) {
  const url = new URL(request.url);
  if (url.searchParams.has("afterPosition")) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterPosition não pertence à paginação atual. Use somente afterId."
    );
  }
  const rawId = url.searchParams.get(cursorId);
  const result = { limit: positiveLimit(request) };
  if (rawId != null) result[cursorId] = validateUuid(rawId);
  if (query) {
    result.query = String(url.searchParams.get("query") || "").trim();
    if (result.query.length > 200) {
      throw new AuthoringApiError(422, "invalid_pagination", "query é longa demais.");
    }
  }
  if (retired) result.includeRetired = url.searchParams.get("includeRetired") === "true";
  return result;
}

function workspaceObservationPagination(request) {
  const url = new URL(request.url);
  const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
  const beforeId = url.searchParams.get("beforeId");
  if ((beforeUpdatedAt == null) !== (beforeId == null)) {
    throw new AuthoringApiError(
      422, "invalid_pagination", "beforeUpdatedAt e beforeId devem ser usados juntos."
    );
  }
  if (beforeUpdatedAt != null && !validRfc3339DateTime(beforeUpdatedAt)) {
    throw new AuthoringApiError(
      422, "invalid_pagination", "beforeUpdatedAt deve usar data e hora RFC 3339 válida."
    );
  }
  return {
    // Achados estruturados carregam evidência pública e lifecycle. A página
    // física fica menor que o limite solicitado para manter a Action abaixo
    // de 96 KiB; o cursor autoritativo continua permitindo percorrer tudo.
    limit: Math.min(positiveLimit(request, 20, 50), 5),
    beforeUpdatedAt,
    beforeId: beforeId == null ? null : validateUuid(beforeId),
    entityTypes: boundedStringList(url, "entityTypes", new Set([
      "workspace", "course", "module", "lesson", "microsequence", "card", "resource"
    ]), 7),
    kinds: boundedStringList(url, "kinds", new Set([
      "note", "audit_finding"
    ]), 2),
    statuses: boundedStringList(url, "statuses", new Set([
      "open", "approved", "rejected", "repaired", "resolved"
    ]), 5)
  };
}

function trailPagination(request) {
  const url = new URL(request.url);
  const result = { limit: positiveLimit(request, 20, 25) };
  const afterId = url.searchParams.get("afterId");
  return afterId == null ? result : { ...result, afterId: validateUuid(afterId) };
}

function workspaceCardPagination(request) {
  const url = new URL(request.url);
  const microsequencePath = entityPathFromUrl(url, "microsequencePath");
  if (!microsequencePath || microsequencePath.length !== 4) {
    throw new AuthoringApiError(
      422,
      "invalid_workspace_entity_path",
      "microsequencePath deve conter exatamente quatro ids."
    );
  }
  const rawPosition = url.searchParams.get("afterPosition");
  const rawId = url.searchParams.get("afterId");
  if ((rawPosition == null) !== (rawId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterPosition e afterId devem ser usados juntos."
    );
  }
  const result = {
    microsequencePath,
    limit: positiveLimit(request)
  };
  if (rawPosition == null) return result;
  const afterPosition = Number(rawPosition);
  const afterId = String(rawId).trim();
  if (!Number.isSafeInteger(afterPosition) || afterPosition < 1
      || !afterId || afterId.length > 240) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "O cursor de cards da microssequência é inválido."
    );
  }
  return { ...result, afterPosition, afterId };
}

function reviewPagination(request) {
  const url = new URL(request.url);
  const beforeSubmittedAt = url.searchParams.get("beforeSubmittedAt");
  const beforeId = url.searchParams.get("beforeId");
  if ((beforeSubmittedAt == null) !== (beforeId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "beforeSubmittedAt e beforeId devem ser usados juntos."
    );
  }
  const result = { limit: positiveLimit(request) };
  if (beforeSubmittedAt == null) return result;
  if (!validRfc3339DateTime(beforeSubmittedAt)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "beforeSubmittedAt deve usar data e hora RFC 3339 válida."
    );
  }
  return {
    ...result,
    beforeSubmittedAt,
    beforeId: workspaceUuid(beforeId, "beforeId")
  };
}

function catalogSearchPagination(request) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get("query") || "").trim();
  const afterTitleValue = url.searchParams.get("afterTitle");
  const afterCourseIdValue = url.searchParams.get("afterCourseId");
  if (query.length < 2 || query.length > 200) {
    throw new AuthoringApiError(
      422,
      "invalid_catalog_query",
      "query deve conter de 2 a 200 caracteres."
    );
  }
  if ((afterTitleValue == null) !== (afterCourseIdValue == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterTitle e afterCourseId devem ser usados juntos."
    );
  }
  const result = {
    query,
    limit: positiveLimit(request, 20, 50)
  };
  if (afterTitleValue == null) return result;
  const afterTitle = afterTitleValue.trim();
  if (!afterTitle || afterTitle.length > 300) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      "afterTitle é inválido."
    );
  }
  return {
    ...result,
    afterTitle,
    afterCourseId: workspaceUuid(afterCourseIdValue, "afterCourseId")
  };
}

async function payload(request, validator) {
  const value = validator(await readJsonBody(request, STANDARD_BODY_LIMIT));
  reconcileRequestId(request, value);
  return value;
}

export async function executeAuthoringRoute({
  request,
  route,
  adapter,
  principal,
  deadlineAt = null
}) {
  if (deadlineAt != null) {
    const base = adapter;
    adapter = new Proxy(base, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function"
          ? (options = {}) => value.call(target, { ...options, deadlineAt })
          : value;
      }
    });
  }

  if (route.name === "listWorkspaces") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
    const beforeId = url.searchParams.get("beforeId");
    if ((beforeUpdatedAt == null) !== (beforeId == null)) {
      throw new AuthoringApiError(422, "invalid_pagination", "O cursor do workspace está incompleto.");
    }
    return {
      data: await adapter.listWorkspaces({
        principal,
        limit: positiveLimit(request),
        beforeUpdatedAt,
        beforeId: beforeId == null ? null : workspaceUuid(beforeId, "beforeId")
      }),
      requestId: null
    };
  }
  if (route.name === "createWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateCreateWorkspacePayload);
    return {
      data: await adapter.createWorkspace({
        principal,
        workspaceId: await deterministicRequestUuid(
          `${principal.actorId}:workspace:${value.requestId}`
        ),
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "getWorkspace") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "outline";
    const entityType = url.searchParams.get("entityType");
    const entityPath = entityPathFromUrl(url);
    if (view === "entity" && (!entityType || !entityPath)) {
      throw new AuthoringApiError(422, "invalid_workspace_view", "A entidade não foi identificada.");
    }
    return {
      data: await adapter.getWorkspace({
        principal,
        workspaceId: route.workspaceId,
        view,
        entityType: entityType ? workspaceEntityType(entityType) : null,
        entityPath,
        includeDescendants: url.searchParams.get("includeDescendants") !== "false"
      }),
      requestId: null
    };
  }
  if (route.name === "getEducationalWorkspace") {
    assertAuthoringScope(principal, "read");
    return {
      data: await adapter.getEducationalWorkspace({
        principal,
        workspaceId: route.workspaceId
      }),
      requestId: null
    };
  }
  if (route.name === "manageEducationalWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateEducationalWorkspaceActionPayload);
    return {
      data: await adapter.manageEducationalWorkspace({ principal, ...value }),
      requestId: value.requestId
    };
  }
  if (route.name === "listEducationalWorkspaceComments") {
    assertAuthoringScope(principal, "read");
    return {
      data: await adapter.listEducationalWorkspaceComments({
        principal,
        workspaceId: route.workspaceId,
        ...workspaceCommentPagination(request)
      }),
      requestId: null
    };
  }
  if (route.name === "manageEducationalWorkspaceComment") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateEducationalWorkspaceCommentActionPayload);
    return {
      data: await adapter.manageEducationalWorkspaceComment({
        principal,
        workspaceId: route.workspaceId,
        commentId: route.commentId,
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "listWorkspaceObservations") {
    assertAuthoringScope(principal, "read");
    return {
      data: await adapter.listWorkspaceObservations({
        principal,
        workspaceId: route.workspaceId,
        ...workspaceObservationPagination(request)
      }),
      requestId: null
    };
  }
  if (route.name === "manageWorkspaceObservation") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateWorkspaceObservationActionPayload);
    return {
      data: await adapter.manageWorkspaceObservation({
        principal,
        workspaceId: route.workspaceId,
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "listWorkspaceMicrosequenceCards") {
    assertAuthoringScope(principal, "read");
    return {
      data: await adapter.listWorkspaceMicrosequenceCards({
        principal,
        workspaceId: route.workspaceId,
        ...workspaceCardPagination(request)
      }),
      requestId: null
    };
  }
  if (route.name === "getWorkspaceEvents") {
    assertAuthoringScope(principal, "read");
    const beforeRevisionText = new URL(request.url).searchParams.get("beforeRevision");
    const beforeRevision = beforeRevisionText == null ? null : Number(beforeRevisionText);
    if (beforeRevision != null && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1)) {
      throw new AuthoringApiError(
        422,
        "invalid_pagination",
        "beforeRevision deve ser um inteiro positivo."
      );
    }
    return {
      data: await adapter.getWorkspaceEvents({
        principal,
        workspaceId: route.workspaceId,
        limit: positiveLimit(request),
        beforeRevision
      }),
      requestId: null
    };
  }
  if (route.name === "submitCatalogReview") {
    assertScope(principal, "catalog:submit");
    const value = await payload(request, validateSubmitCatalogReviewPayload);
    return {
      data: await adapter.submitCourseForReview({
        principal,
        submissionId: await deterministicRequestUuid(
          `${principal.actorId}:catalog-review:${value.requestId}`
        ),
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "createCatalogCollection") {
    assertScope(principal, "catalog:manage");
    const value = await payload(request, validateCreateCatalogCollectionPayload);
    return {
      data: await adapter.createCatalogCollection({
        principal,
        collectionId: await deterministicRequestUuid(
          `${principal.actorId}:catalog-collection:${value.requestId}`
        ),
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "updateCatalogCollection") {
    assertScope(principal, "catalog:manage");
    const value = await payload(request, validateUpdateCatalogCollectionPayload);
    return {
      data: await adapter.updateCatalogCollection({
        principal, collectionId: route.collectionId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "retireCatalogCollection") {
    assertScope(principal, "catalog:manage");
    const value = await payload(request, validateRetireCatalogCollectionPayload);
    return {
      data: await adapter.retireCatalogCollection({
        principal, collectionId: route.collectionId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "moveCatalogCourse") {
    assertScope(principal, "catalog:manage");
    const value = await payload(request, validateMoveCatalogCoursePayload);
    return {
      data: await adapter.moveCatalogCourse({
        principal, courseId: route.courseId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "removeCatalogCourse") {
    assertScope(principal, "catalog:manage");
    const value = await payload(request, validateRemoveCatalogCoursePayload);
    return {
      data: await adapter.removeCatalogCourse({
        principal, courseId: route.courseId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "listCatalogReviews") {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "mine";
    if (!["mine", "queue"].includes(view)) {
      throw new AuthoringApiError(
        422,
        "invalid_review_view",
        "view deve ser mine ou queue."
      );
    }
    const pagination = reviewPagination(request);
    if (view === "queue") assertScope(principal, "catalog:review");
    else assertScope(principal, "catalog:submit");
    return {
      data: await adapter.listCatalogReviews({
        principal,
        view,
        ...pagination
      }),
      requestId: null
    };
  }
  if (route.name === "readCatalogReview") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "outline";
    const entityType = url.searchParams.get("entityType");
    const entityPath = entityPathFromUrl(url);
    if (view === "entity" && (!entityType || !entityPath)) {
      throw new AuthoringApiError(
        422, "invalid_review_view", "A entidade não foi identificada."
      );
    }
    return {
      data: await adapter.readCatalogReview({
        principal,
        submissionId: route.submissionId,
        view,
        entityType: entityType ? workspaceEntityType(entityType) : null,
        entityPath,
        includeDescendants: url.searchParams.get("includeDescendants") !== "false"
      }),
      requestId: null
    };
  }
  if (route.name === "claimCatalogReview") {
    assertScope(principal, "catalog:review");
    const value = await payload(request, validateCatalogReviewCommandPayload);
    return {
      data: await adapter.claimCatalogReview({
        principal,
        submissionId: route.submissionId
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "createCatalogReviewWorkspace") {
    assertScope(principal, "catalog:review");
    const value = await payload(request, validateCreateReviewWorkspacePayload);
    return {
      data: await adapter.createCatalogReviewWorkspace({
        principal,
        submissionId: route.submissionId,
        workspaceId: await deterministicRequestUuid(
          `${principal.actorId}:review-workspace:${value.requestId}`
        ),
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "decideCatalogReview") {
    assertScope(principal, "catalog:review");
    const value = await payload(request, validateCatalogReviewDecisionPayload);
    return {
      data: await adapter.decideCatalogReview({
        principal,
        submissionId: route.submissionId,
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "withdrawCatalogReview") {
    assertScope(principal, "catalog:submit");
    const value = await payload(request, validateCatalogReviewCommandPayload);
    return {
      data: await adapter.withdrawCatalogReview({
        principal,
        submissionId: route.submissionId
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "readCourseContent") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "outline";
    const entityType = url.searchParams.get("entityType");
    const entityPath = entityPathFromUrl(url);
    if (view === "entity" && (!entityType || !entityPath)) {
      throw new AuthoringApiError(422, "invalid_course_view", "A entidade não foi identificada.");
    }
    return {
      data: await adapter.readCourseContent({
        principal,
        courseId: route.courseId,
        view,
        entityType: entityType ? workspaceEntityType(entityType) : null,
        entityPath,
        includeDescendants: url.searchParams.get("includeDescendants") !== "false"
      }),
      requestId: null
    };
  }
  if (route.name === "manageWorkspaceDesign") {
    const value = validateWorkspaceDesignActionPayload(
      await readJsonBody(request, WORKSPACE_DESIGN_ACTION_BODY_LIMIT)
    );
    reconcileRequestId(request, value);
    if (new Set(["read_slice", "contracts"]).has(value.operation)) {
      assertAuthoringScope(principal, "read");
    } else {
      assertAuthoringScope(principal, "write");
    }
    return {
      data: await executeWorkspaceDesignAction({
        adapter,
        principal,
        workspaceId: route.workspaceId,
        deadlineAt,
        ...value
      }),
      requestId: value.requestId || null
    };
  }
  if (route.name === "manageWorkspaceExperiment") {
    const value = validateWorkspaceExperimentActionPayload(
      await readJsonBody(request, WORKSPACE_EXPERIMENT_ACTION_BODY_LIMIT)
    );
    reconcileRequestId(request, value);
    if (new Set(["list", "list_options", "read"]).has(value.operation)) {
      assertAuthoringScope(principal, "read");
    } else {
      assertAuthoringScope(principal, "write");
    }
    return {
      data: await executeWorkspaceExperimentAction({
        adapter,
        principal,
        workspaceId: route.workspaceId,
        deadlineAt,
        ...value
      }),
      requestId: value.requestId || null
    };
  }
  if (route.name === "manageExperimentEnrollment") {
    const value = validateExperimentEnrollmentActionPayload(
      await readJsonBody(request, EXPERIMENT_ENROLLMENT_ACTION_BODY_LIMIT)
    );
    reconcileRequestId(request, value);
    if (new Set(["read_policy", "status"]).has(value.operation)) {
      assertAuthoringScope(principal, "read");
    } else {
      assertAuthoringScope(principal, "write");
    }
    return {
      data: await executeExperimentEnrollmentAction({
        adapter,
        principal,
        deadlineAt,
        ...value
      }),
      requestId: value.requestId || null
    };
  }
  if (route.name === "mutateWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateWorkspaceMutationPayload);
    const mutationOptions = {
      principal,
      workspaceId: route.workspaceId,
      ...value
    };
    const replay = typeof adapter.replayWorkspaceMutation === "function"
      ? () => adapter.replayWorkspaceMutation(mutationOptions)
      : async () => null;
    const replayed = await replay();
    if (replayed) {
      return { data: replayed, requestId: value.requestId };
    }
    try {
      await validateWorkspaceCardDesignAccess({
        adapter,
        principal,
        workspaceId: route.workspaceId,
        expectedRevision: value.expectedRevision,
        operation: value.operation,
        arguments: value.arguments
      });
    } catch (cause) {
      if (!(cause instanceof AuthoringApiError) || cause.status !== 409) throw cause;
      const racedReplay = await replay();
      if (racedReplay) return { data: racedReplay, requestId: value.requestId };
      throw cause;
    }
    let result;
    try {
      result = await adapter.mutateWorkspace(mutationOptions);
    } catch (cause) {
      if (!(cause instanceof AuthoringApiError) || cause.status !== 409) throw cause;
      const racedReplay = await replay();
      if (racedReplay) return { data: racedReplay, requestId: value.requestId };
      throw cause;
    }
    return {
      data: result,
      requestId: value.requestId
    };
  }
  if (route.name === "manageWorkspaceContinuity") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateWorkspaceContinuityActionPayload);
    return {
      data: await adapter.manageWorkspaceContinuity({
        principal, workspaceId: route.workspaceId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "importCourseIntoWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateWorkspaceImportPayload);
    return {
      data: await adapter.importCourseIntoWorkspace({
        principal, workspaceId: route.workspaceId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "publishWorkspaceCourse") {
    const value = await payload(request, validateWorkspacePublishPayload);
    if (value.target === "catalog") assertScope(principal, "catalog:publish");
    else assertAuthoringScope(principal, "write", "private");
    return {
      data: await adapter.publishWorkspaceCourse({
        principal, workspaceId: route.workspaceId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "deleteWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateDeleteWorkspacePayload);
    return {
      data: await adapter.deleteWorkspace({
        principal, workspaceId: route.workspaceId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "listPersonalLibraryCourses") {
    assertAuthoringScope(principal, "read", "private");
    return {
      data: await adapter.listPersonalLibraryCourses({
        principal,
        ...trailPagination(request)
      }),
      requestId: null
    };
  }
  if (route.name === "removePersonalLibraryCourse") {
    assertAuthoringScope(principal, "write", "private");
    const value = await payload(
      request,
      validateRemovePersonalLibraryCoursePayload
    );
    return {
      data: await adapter.removePersonalLibraryCourse({
        principal,
        courseId: route.courseId,
        ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "listCatalogCollections") {
    const pagination = identityPagination(request, "afterId", {
      query: true,
      retired: true
    });
    if (pagination.includeRetired) assertScope(principal, "catalog:publish");
    else assertScope(principal, "catalog:read");
    return {
      data: await adapter.listCatalogCollections({
        principal,
        ...pagination
      }),
      requestId: null
    };
  }
  if (route.name === "listCatalogCourses") {
    assertScope(principal, "catalog:read");
    return {
      data: await adapter.listCatalogCourses({
        principal,
        collectionId: route.collectionId,
        ...identityPagination(request, "afterId", { query: true })
      }),
      requestId: null
    };
  }
  if (route.name === "searchCatalogCourses") {
    assertScope(principal, "catalog:read");
    return {
      data: await adapter.searchCatalogCourses({
        principal,
        ...catalogSearchPagination(request)
      }),
      requestId: null
    };
  }
  throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
}
