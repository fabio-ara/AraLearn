import { deterministicRequestUuid } from "./canonical.js";
import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract,
  listAuthoringResourceContracts
} from "../aralearn/runtime/core/authoringResourceContract.js";
import {
  STANDARD_BODY_LIMIT,
  readJsonBody,
  routeRequest,
  validateCreateCatalogCollectionPayload,
  validateCreatePersonalStudyPathPayload,
  validateCreatePrivateIntegrationPayload,
  validateDeletePersonalStudyPathPayload,
  validateMoveCatalogCoursePayload,
  validateMovePersonalCourseSelectionPayload,
  validateRenameCatalogCollectionPayload,
  validateRenamePersonalStudyPathPayload,
  validateReorderCatalogCollectionsPayload,
  validateReorderCatalogCoursesPayload,
  validateRetireCatalogCollectionPayload,
  validateRotatePrivateIntegrationPayload,
  validateRunId
} from "./protocol.js";
import {
  assertScope,
  corsHeaders,
  preflightHeaders,
  readAuthorization
} from "./security.js";
import {
  validateCreateWorkspacePayload,
  validateDeleteWorkspacePayload,
  validateWorkspaceImportPayload,
  validateWorkspaceMutationPayload,
  validateWorkspacePublishPayload,
  workspaceEntityType,
  workspaceUuid
} from "./workspaceProtocol.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function jsonResponse(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
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
    "A credencial não permite esta operação de autoria."
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

function positiveLimit(request, fallback = 50, maximum = 100) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new AuthoringApiError(422, "invalid_pagination", `limit deve ficar entre 1 e ${maximum}.`);
  }
  return limit;
}

function positionedPagination(request, cursorId, { query = false, retired = false } = {}) {
  const url = new URL(request.url);
  const rawPosition = url.searchParams.get("afterPosition");
  const rawId = url.searchParams.get(cursorId);
  if ((rawPosition == null) !== (rawId == null)) {
    throw new AuthoringApiError(
      422,
      "invalid_pagination",
      `afterPosition e ${cursorId} devem ser usados juntos.`
    );
  }
  const result = { limit: positiveLimit(request) };
  if (rawPosition != null) {
    const afterPosition = Number(rawPosition);
    if (!Number.isSafeInteger(afterPosition) || afterPosition < 0) {
      throw new AuthoringApiError(422, "invalid_pagination", "afterPosition é inválido.");
    }
    result.afterPosition = afterPosition;
    result[cursorId] = validateRunId(rawId);
  }
  if (query) {
    result.query = String(url.searchParams.get("query") || "").trim();
    if (result.query.length > 200) {
      throw new AuthoringApiError(422, "invalid_pagination", "query é longa demais.");
    }
  }
  if (retired) result.includeRetired = url.searchParams.get("includeRetired") === "true";
  return result;
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
    const revisionText = url.searchParams.get("revision");
    const revision = revisionText == null ? null : Number(revisionText);
    if (revision != null && (!Number.isInteger(revision) || revision < 1)) {
      throw new AuthoringApiError(422, "invalid_workspace_revision", "revision é inválida.");
    }
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (view === "entity" && (!entityType || !entityId)) {
      throw new AuthoringApiError(422, "invalid_workspace_view", "A entidade não foi identificada.");
    }
    return {
      data: await adapter.getWorkspace({
        principal,
        workspaceId: route.workspaceId,
        revision,
        view,
        entityType: entityType ? workspaceEntityType(entityType) : null,
        entityId,
        includeDescendants: url.searchParams.get("includeDescendants") !== "false",
        courseId: url.searchParams.get("courseId")
      }),
      requestId: null
    };
  }
  if (route.name === "getWorkspaceHistory") {
    assertAuthoringScope(principal, "read");
    return {
      data: await adapter.getWorkspaceHistory({
        principal,
        workspaceId: route.workspaceId,
        limit: positiveLimit(request)
      }),
      requestId: null
    };
  }
  if (route.name === "readCourseContent") {
    assertAuthoringScope(principal, "read");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "outline";
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (view === "entity" && (!entityType || !entityId)) {
      throw new AuthoringApiError(422, "invalid_course_view", "A entidade não foi identificada.");
    }
    return {
      data: await adapter.readCourseContent({
        principal,
        courseId: route.courseId,
        view,
        entityType: entityType ? workspaceEntityType(entityType) : null,
        entityId,
        includeDescendants: url.searchParams.get("includeDescendants") !== "false"
      }),
      requestId: null
    };
  }
  if (route.name === "mutateWorkspace") {
    assertAuthoringScope(principal, "write");
    const value = await payload(request, validateWorkspaceMutationPayload);
    return {
      data: await adapter.mutateWorkspace({
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
    const definition = getAuthoringResourceContract(route.resource);
    if (!definition) throw new AuthoringApiError(404, "resource_not_found", "Recurso inexistente.");
    return {
      data: { contract: AUTHORING_RESOURCE_CONTRACT_VERSION, definition },
      requestId: null
    };
  }
  if (route.name === "listPrivateIntegrations") {
    assertAuthenticatedSession(principal);
    return { data: await adapter.listPrivateIntegrations({ principal }), requestId: null };
  }
  if (route.name === "createPrivateIntegration") {
    assertAuthenticatedSession(principal);
    const value = await payload(request, validateCreatePrivateIntegrationPayload);
    return {
      data: await adapter.createPrivateIntegration({ principal, ...value }),
      requestId: value.requestId
    };
  }
  if (route.name === "rotatePrivateIntegration") {
    assertAuthenticatedSession(principal);
    const value = await payload(request, validateRotatePrivateIntegrationPayload);
    return {
      data: await adapter.rotatePrivateIntegration({
        principal, clientId: route.clientId, ...value
      }),
      requestId: value.requestId
    };
  }
  if (route.name === "revokePrivateIntegration") {
    assertAuthenticatedSession(principal);
    return {
      data: await adapter.revokePrivateIntegration({
        principal, clientId: route.clientId
      }),
      requestId: null
    };
  }
  if (route.name === "listPersonalLibraryCourses") {
    assertAuthoringScope(principal, "read", "private");
    return {
      data: await adapter.listPersonalLibraryCourses({
        principal,
        ...positionedPagination(request, "afterSelectionId", { query: true })
      }),
      requestId: null
    };
  }
  if (route.name === "listPersonalStudyPaths") {
    assertAuthoringScope(principal, "read", "private");
    return {
      data: await adapter.listPersonalStudyPaths({
        principal, ...positionedPagination(request, "afterPathId")
      }),
      requestId: null
    };
  }

  const personalWrites = {
    createPersonalStudyPath: [validateCreatePersonalStudyPathPayload, "createPersonalStudyPath", {}],
    renamePersonalStudyPath: [validateRenamePersonalStudyPathPayload, "renamePersonalStudyPath", { pathId: route.pathId }],
    deletePersonalStudyPath: [validateDeletePersonalStudyPathPayload, "deletePersonalStudyPath", { pathId: route.pathId }],
    movePersonalCourseSelection: [validateMovePersonalCourseSelectionPayload, "movePersonalCourseSelection", { selectionId: route.selectionId }]
  };
  if (personalWrites[route.name]) {
    assertAuthoringScope(principal, "write", "private");
    const [validator, method, identity] = personalWrites[route.name];
    const value = await payload(request, validator);
    return {
      data: await adapter[method]({ principal, ...identity, ...value }),
      requestId: value.requestId
    };
  }

  if (route.name === "listCatalogCollections") {
    assertScope(principal, "catalog:publish");
    return {
      data: await adapter.listCatalogCollections({
        principal,
        ...positionedPagination(request, "afterId", { query: true, retired: true })
      }),
      requestId: null
    };
  }
  if (route.name === "listCatalogCourses") {
    assertScope(principal, "catalog:publish");
    return {
      data: await adapter.listCatalogCourses({
        principal,
        collectionId: route.collectionId,
        ...positionedPagination(request, "afterId", { query: true })
      }),
      requestId: null
    };
  }
  if (route.name === "getCatalogCourse") {
    assertScope(principal, "catalog:publish");
    return {
      data: await adapter.getCatalogCourse({ principal, courseId: route.courseId }),
      requestId: null
    };
  }

  const catalogWrites = {
    createCatalogCollection: [validateCreateCatalogCollectionPayload, "createCatalogCollection", {}],
    renameCatalogCollection: [validateRenameCatalogCollectionPayload, "renameCatalogCollection", { collectionId: route.collectionId }],
    retireCatalogCollection: [validateRetireCatalogCollectionPayload, "retireCatalogCollection", { collectionId: route.collectionId }],
    reorderCatalogCollections: [validateReorderCatalogCollectionsPayload, "reorderCatalogCollections", {}],
    moveCatalogCourse: [validateMoveCatalogCoursePayload, "moveCatalogCourse", { courseId: route.courseId }],
    reorderCatalogCourses: [validateReorderCatalogCoursesPayload, "reorderCatalogCourses", { collectionId: route.collectionId }]
  };
  if (catalogWrites[route.name]) {
    assertScope(principal, "catalog:publish");
    const [validator, method, identity] = catalogWrites[route.name];
    const value = await payload(request, validator);
    return {
      data: await adapter[method]({ principal, ...identity, ...value }),
      requestId: value.requestId
    };
  }
  throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
}

export function createAuthoringHandler({ adapter, allowedOrigins = new Set() }) {
  if (!adapter) throw new TypeError("O handler de autoria exige um adaptador.");
  return async function handleAuthoringRequest(request) {
    let headers = { Vary: "Origin" };
    const traceId = globalThis.crypto?.randomUUID?.() || `trace-${Date.now()}`;
    try {
      if (request.method === "OPTIONS") {
        headers = preflightHeaders(request, allowedOrigins);
        return new Response(null, { status: 204, headers });
      }
      headers = corsHeaders(request, allowedOrigins);
      const route = routeRequest(request.method, new URL(request.url).pathname);
      const principal = await adapter.resolvePrincipal(readAuthorization(request), {
        deadlineAt: Date.now() + 50_000
      });
      const result = await executeAuthoringRoute({
        request,
        route,
        adapter,
        principal,
        deadlineAt: Date.now() + 50_000
      });
      return jsonResponse(
        200,
        {
          ok: true,
          requestId: requestIdFromHeaders(request) || result.requestId || traceId,
          data: result.data ?? null
        },
        headers
      );
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      return jsonResponse(
        normalized.status,
        {
          ok: false,
          requestId: requestIdFromHeaders(request) || traceId,
          error: {
            code: normalized.code,
            message: normalized.message,
            ...(normalized.details === undefined ? {} : { details: normalized.details })
          }
        },
        headers
      );
    }
  };
}
