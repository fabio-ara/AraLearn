import {
  normalizeAuthoringAnalyticsScope,
  serializeAuthoringAnalyticsExportPage
} from "../aralearn/runtime/authoring/authoringAnalytics.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const CONTRACT = "aralearn.authoring-analytics.v1";
const RESPONSE_LIMIT_BYTES = 90 * 1024;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function ref(value, field) {
  const id = text(value?.id);
  const version = text(value?.version);
  if (!id || !version) {
    throw new AuthoringApiError(500, "invalid_analytics_backend_result", `${field} não contém ref versionada.`);
  }
  return { id, version };
}

function requireMethod(adapter, method) {
  if (typeof adapter?.[method] !== "function") {
    throw new AuthoringApiError(500, "analytics_backend_unavailable", `O backend não oferece ${method}.`);
  }
  return adapter[method].bind(adapter);
}

function bounded(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > RESPONSE_LIMIT_BYTES) {
    throw new AuthoringApiError(
      500,
      "analytics_response_budget_exceeded",
      "A página de analytics excedeu o envelope seguro.",
      { bytes, maximumBytes: RESPONSE_LIMIT_BYTES }
    );
  }
  return value;
}

function datasetResult(workspaceId, raw) {
  const page = raw?.page || {};
  return {
    contract: CONTRACT,
    schemaVersion: text(raw?.schemaVersion) || "1.0.0",
    operation: "dataset",
    workspaceId,
    dataset: text(raw?.dataset),
    scope: clone(raw?.scope),
    datasetSetRef: ref(raw?.datasetSetRef, "datasetSetRef"),
    dictionary: Array.isArray(raw?.dictionary) ? clone(raw.dictionary) : [],
    page: {
      items: Array.isArray(page.items) ? clone(page.items) : [],
      count: Number(page.count) || 0,
      nextCursor: text(page.nextCursor) || null,
      truncated: page.truncated === true
    }
  };
}

export async function executeAuthoringAnalyticsAction({
  adapter,
  principal,
  workspaceId,
  operation,
  scope,
  dataset = null,
  datasetSetRef = null,
  cursor = null,
  limit = 20,
  format = null,
  deadlineAt = null
}) {
  let normalizedScope;
  try {
    normalizedScope = normalizeAuthoringAnalyticsScope(scope);
  } catch (cause) {
    throw new AuthoringApiError(422, "invalid_analytics_scope", cause.message);
  }
  if (operation === "overview") {
    if (!["workspace", "experiment"].includes(normalizedScope.kind)) {
      throw new AuthoringApiError(
        422,
        "invalid_analytics_overview_scope",
        "O overview aceita somente o workspace ou um experimento."
      );
    }
    const raw = await requireMethod(adapter, "getAuthoringAnalyticsOverview")({
      actorId: principal?.actorId,
      workspaceId,
      scope: normalizedScope,
      deadlineAt
    });
    return bounded({
      contract: CONTRACT,
      schemaVersion: text(raw?.schemaVersion) || "1.0.0",
      operation,
      workspaceId,
      workspaceRevision: raw?.workspaceRevision,
      scope: clone(raw?.scope || normalizedScope),
      overviewSetRef: ref(raw?.overviewSetRef, "overviewSetRef"),
      permissions: clone(raw?.permissions || {}),
      sections: Array.isArray(raw?.sections) ? clone(raw.sections) : []
    });
  }
  const raw = await requireMethod(adapter, "listAuthoringAnalyticsDataset")({
    actorId: principal?.actorId,
    workspaceId,
    dataset,
    scope: normalizedScope,
    datasetSetRef,
    cursor,
    limit: Math.min(limit || 20, 20),
    deadlineAt
  });
  const normalized = datasetResult(workspaceId, raw);
  if (datasetSetRef
      && `${datasetSetRef.id}@${datasetSetRef.version}`
        !== `${normalized.datasetSetRef.id}@${normalized.datasetSetRef.version}`) {
    throw new AuthoringApiError(409, "analytics_dataset_changed", "O dataset mudou durante a paginação.");
  }
  if (operation === "dataset") return bounded(normalized);
  const chunk = serializeAuthoringAnalyticsExportPage({
    dataset: normalized.dataset,
    datasetSetRef: normalized.datasetSetRef,
    scope: normalized.scope,
    dictionary: cursor ? [] : normalized.dictionary,
    items: normalized.page.items,
    format,
    includeHeader: !cursor
  });
  return bounded({
    contract: CONTRACT,
    schemaVersion: normalized.schemaVersion,
    operation: "export",
    workspaceId,
    dataset: normalized.dataset,
    scope: normalized.scope,
    datasetSetRef: normalized.datasetSetRef,
    format,
    filename: `${normalized.dataset}-${normalized.datasetSetRef.version.slice(0, 12)}.${format}`,
    mimeType: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
    chunk,
    checksum: await sha256Hex(chunk),
    nextCursor: normalized.page.nextCursor,
    complete: normalized.page.truncated !== true
  });
}

export async function executeExperimentOutcomeAction({
  adapter,
  principal,
  workspaceId,
  enrollmentRef,
  requestId,
  payload,
  deadlineAt = null
}) {
  const payloadHash = await sha256Hex(canonicalJsonStringify({ workspaceId, enrollmentRef, payload }));
  const raw = await requireMethod(adapter, "recordAuthoringExperimentOutcome")({
    actorId: principal?.actorId,
    workspaceId,
    enrollmentRef,
    requestId,
    payloadHash,
    payload,
    deadlineAt
  });
  return bounded({
    contract: "aralearn.authoring-analytics-outcome.v1",
    operation: "record_outcome",
    observationRef: text(raw?.observationRef),
    enrollmentRef: text(raw?.enrollmentRef || enrollmentRef),
    experimentId: text(raw?.experimentId),
    datasetRevision: Number(raw?.datasetRevision) || 0,
    idempotent: raw?.idempotent === true
  });
}
