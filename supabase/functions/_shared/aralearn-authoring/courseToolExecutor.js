import { AuthoringApiError } from "./errors.js";
import { routeCourseRequest } from "./courseProtocol.js";
import { executeCourseRoute } from "./courseRouter.js";
import {
  authoringApplicationToolIsAllowed,
  authoringMcpToolIsAllowed,
  mapAuthoringApplicationToolCall,
  mapAuthoringMcpToolCall,
  validateAuthoringApplicationToolOutput,
  validateAuthoringMcpToolOutput
} from "./courseMcpTools.js";

function parseStudyUnitJson(source) {
  try {
    const value = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AuthoringApiError(
      422,
      "invalid_study_unit_json",
      "studyUnitJson precisa conter um objeto JSON válido."
    );
  }
}

function previewDeepLink(publicAppUrl, courseId, studyUnitId) {
  const base = String(publicAppUrl || "").replace(/\/+$/u, "");
  if (!base) return null;
  return courseId && studyUnitId
    ? `${base}/#/authoring/courses/${encodeURIComponent(courseId)}` +
      `?section=inspection&studyUnitId=${encodeURIComponent(studyUnitId)}`
    : `${base}/#/authoring`;
}

const MCP_ANNOTATION_PAGE_CONTRACT = "aralearn.course-anchored-annotation-page.v1";
const MCP_ANNOTATION_CHANGE_CONTRACT = "aralearn.course-anchored-annotation-change.v1";
const MCP_AUDIT_CYCLE_PAGE_CONTRACT = "aralearn.course-audit-cycle-page.v1";
const COURSE_SOURCES_CONTRACT = "aralearn.course-sources.v1";
const COURSE_SOURCE_ATTACHMENT_ACCESS_CONTRACTS = new Set([
  "aralearn.course-source-attachment-access.v1",
  "aralearn.course-source-attachment-access.v2"
]);
const MCP_ATTACHMENT_DOWNLOAD_EXPIRY_SECONDS = 60;

function annotationTargetLabel(target) {
  const path = Array.isArray(target?.currentPath) && target.currentPath.length
    ? target.currentPath
    : Array.isArray(target?.observedPath)
      ? target.observedPath
      : [];
  const label = path.at(-1)?.label;
  return typeof label === "string" && label.trim() ? label : null;
}

function projectedSubjects(classification) {
  const subjects = Array.isArray(classification?.effective?.subjects)
    ? classification.effective.subjects
    : [];
  return subjects
    .map(({ label }) => typeof label === "string" && label.trim() ? { label } : null)
    .filter(Boolean);
}

function projectAnnotationForMcp(annotation, { includeObservationText = false } = {}) {
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) return null;
  const ownerResponse = annotation.ownerResponse && typeof annotation.ownerResponse === "object"
    ? {
        kind: annotation.ownerResponse.kind ?? null,
        hasText: typeof annotation.ownerResponse.text === "string" &&
          annotation.ownerResponse.text.length > 0
      }
    : null;
  return {
    annotationId: annotation.annotationId ?? null,
    annotationVersion: annotation.annotationVersion ?? null,
    provenance: {
      origin: annotation.provenance?.origin ?? null,
      channel: annotation.provenance?.channel ?? null
    },
    contributor: {
      kind: annotation.contributor?.kind ?? null,
      role: annotation.contributor?.role ?? null
    },
    target: {
      kind: annotation.target?.kind ?? null,
      label: annotationTargetLabel(annotation.target),
      currentAvailable: annotation.target?.currentAvailable === true
    },
    observedRevision: {
      certainty: annotation.observedRevision?.certainty ?? null,
      courseRevision: annotation.observedRevision?.courseRevision ?? null,
      targetVersion: annotation.observedRevision?.targetVersion ?? null
    },
    ...(includeObservationText ? { rawText: annotation.rawText ?? null } : {}),
    category: annotation.category ?? null,
    briefSummary: annotation.briefSummary ?? null,
    subjectClassification: {
      status: annotation.subjectClassification?.status ?? null,
      subjects: projectedSubjects(annotation.subjectClassification)
    },
    state: annotation.state ?? null,
    ownerResponse,
    capabilities: {
      canRevise: annotation.capabilities?.canRevise === true,
      canWithdraw: annotation.capabilities?.canWithdraw === true,
      canConsider: annotation.capabilities?.canConsider === true,
      canRespond: annotation.capabilities?.canRespond === true,
      canResolve: annotation.capabilities?.canResolve === true,
      canReopen: annotation.capabilities?.canReopen === true,
      canCorrectSubjects: annotation.capabilities?.canCorrectSubjects === true
    }
  };
}

function annotationMcpDisclosure(includeObservationText) {
  return {
    recipient: "connected_mcp_client",
    purpose: "author_triage",
    rawObservationTextIncluded: includeObservationText,
    omitted: [
      "courseId",
      "contributor.ref",
      "contributor.label",
      "target.id",
      "target.observedPath",
      "target.currentPath",
      "target.deepLink",
      "deepLink",
      "ownerResponse.text",
      "ownerResponse.updatedAt",
      "timestamps",
      "subjectClassification.subjects.topicId",
      "subjectClassification.subjects.topicVersion"
    ]
  };
}

function projectSelectedAuditAnnotation(annotation, { includeObservationText = false } = {}) {
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) return null;
  return {
    annotationId: annotation.annotationId ?? null,
    annotationVersion: annotation.annotationVersion ?? null,
    state: annotation.state ?? null,
    category: annotation.category ?? null,
    briefSummary: annotation.briefSummary ?? null,
    target: { kind: annotation.target?.kind ?? null },
    ...(includeObservationText ? { rawText: annotation.rawText ?? null } : {})
  };
}

function projectSourceSelectorForMcp(selector) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) return null;
  if (selector.kind === "page_range") {
    return {
      kind: selector.kind,
      startPage: selector.startPage ?? null,
      endPage: selector.endPage ?? null
    };
  }
  if (selector.kind === "time_range") {
    return {
      kind: selector.kind,
      startMilliseconds: selector.startMilliseconds ?? null,
      endMilliseconds: selector.endMilliseconds ?? null
    };
  }
  if (selector.kind === "uri_fragment") {
    return { kind: selector.kind, fragment: selector.fragment ?? null };
  }
  if (selector.kind === "text_quote") {
    return {
      kind: selector.kind,
      exact: selector.exact ?? null,
      prefix: selector.prefix ?? null,
      suffix: selector.suffix ?? null
    };
  }
  return null;
}

function projectSourceLinkForMcp(link) {
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  return {
    sourceId: link.sourceId ?? null,
    sourceRevision: link.sourceRevision ?? null,
    relation: link.relation ?? null,
    anchors: (Array.isArray(link.anchors) ? link.anchors : []).map((anchor) => ({
      anchorId: anchor?.anchorId ?? null,
      anchorRevision: anchor?.anchorRevision ?? null
    }))
  };
}

function projectSourceAttachmentMetadataForMcp(attachment) {
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return null;
  return {
    contentHash: attachment.contentHash ?? null,
    byteSize: attachment.byteSize ?? null,
    mediaType: attachment.mediaType ?? null,
    ...(attachment.createdAt == null ? {} : { createdAt: attachment.createdAt })
  };
}

function projectSourceRevisionForMcp(source, { detailed = false } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  return {
    sourceId: source.sourceId ?? null,
    revision: source.revision ?? null,
    status: source.status ?? null,
    kind: source.kind ?? null,
    title: source.title ?? null,
    authorship: source.authorship ?? null,
    publicationDate: source.publicationDate ?? null,
    identifier: source.identifier ?? null,
    language: source.language ?? null,
    citationText: source.citationText ?? null,
    url: source.url ?? null,
    editionOrVersion: source.editionOrVersion ?? null,
    origin: source.origin ?? null,
    availability: source.availability ?? null,
    verificationStatus: source.verificationStatus ?? null,
    studyVisibility: source.studyVisibility ?? null,
    anchorCount: source.anchorCount ?? 0,
    createdAt: source.createdAt ?? null,
    ...(detailed
      ? {
        anchors: (Array.isArray(source.anchors) ? source.anchors : []).map((anchor) => ({
          anchorId: anchor?.anchorId ?? null,
          revision: anchor?.revision ?? null,
          sourceRevision: anchor?.sourceRevision ?? null,
          status: anchor?.status ?? null,
          selector: projectSourceSelectorForMcp(anchor?.selector),
          verificationExcerpt: anchor?.verificationExcerpt ?? null,
          createdAt: anchor?.createdAt ?? null
        })),
        attachments: (Array.isArray(source.attachments) ? source.attachments : [])
          .map(projectSourceAttachmentMetadataForMcp)
          .filter(Boolean)
      }
      : {})
  };
}

function projectSourceAttributionForMcp(attribution) {
  if (!attribution || typeof attribution !== "object" || Array.isArray(attribution)) {
    return null;
  }
  return {
    targetKind: attribution.targetKind ?? null,
    targetId: attribution.targetId ?? null,
    targetVersion: attribution.targetVersion ?? null,
    revision: attribution.revision ?? null,
    sourceLinks: (Array.isArray(attribution.sourceLinks) ? attribution.sourceLinks : [])
      .map(projectSourceLinkForMcp)
      .filter(Boolean),
    createdAt: attribution.createdAt ?? null,
    effective: attribution.effective === true
  };
}

function sourceMcpDisclosure(projectedItems) {
  const projectedSelectors = (Array.isArray(projectedItems) ? projectedItems : [])
    .flatMap((item) => Array.isArray(item?.anchors) ? item.anchors : [])
    .map((anchor) => anchor?.selector)
    .filter((selector) => selector && typeof selector === "object" && !Array.isArray(selector));
  const selectorDisclosurePaths = ["exact", "prefix", "suffix", "fragment"]
    .filter((field) => projectedSelectors.some((selector) => Object.hasOwn(selector, field)))
    .map((field) => `items[].anchors[].selector.${field}`);
  return {
    recipient: "connected_mcp_client",
    purpose: "author_source_review",
    attachmentDownloadUrlIncluded: false,
    potentiallyPersonalFreeTextIncluded: [
      "items[].title",
      "items[].authorship",
      "items[].identifier",
      "items[].citationText",
      "items[].url",
      "items[].editionOrVersion",
      "items[].anchors[].verificationExcerpt",
      ...selectorDisclosurePaths
    ],
    omitted: [
      "courseId",
      "items[].actorId",
      "items[].anchors[].actorId",
      "items[].attachments[].actorId",
      "items[].attachments[].storagePath",
      "items[].attributionId",
      "items[].targetHash"
    ]
  };
}

function projectCourseSourcesForMcp(value) {
  const mode = value.mode ?? null;
  const items = (Array.isArray(value.items) ? value.items : [])
    .map((item) => mode === "target"
      ? projectSourceAttributionForMcp(item)
      : projectSourceRevisionForMcp(item, { detailed: mode === "source" }))
    .filter(Boolean);
  return {
    contract: "aralearn.mcp-course-sources.v1",
    courseRevision: value.courseRevision ?? null,
    mode,
    query: {
      sourceId: value.query?.sourceId ?? null,
      targetKind: value.query?.targetKind ?? null,
      targetId: value.query?.targetId ?? null
    },
    pdfStorage: {
      uniqueBytes: value.pdfStorage?.uniqueBytes ?? 0,
      maxUniqueBytes: value.pdfStorage?.maxUniqueBytes ?? 0
    },
    items,
    nextCursor: value.nextCursor ?? null,
    dataDisclosure: sourceMcpDisclosure(items)
  };
}

function attachmentMcpDisclosure(includeAttachmentDownloadUrl) {
  return {
    recipient: "connected_mcp_client",
    purpose: includeAttachmentDownloadUrl
      ? "author_requested_pdf_download"
      : "author_source_attachment_metadata",
    attachmentDownloadUrlIncluded: includeAttachmentDownloadUrl,
    attachmentDownloadUrlKind: includeAttachmentDownloadUrl
      ? "time_limited_bearer_credential"
      : null,
    attachmentDownloadUrlExpiresInSeconds: includeAttachmentDownloadUrl
      ? MCP_ATTACHMENT_DOWNLOAD_EXPIRY_SECONDS
      : null,
    omitted: [
      "courseId",
      "storageOriginCourseId",
      "attachment.storagePath",
      "attachment.actorId"
    ]
  };
}

function projectSourceAttachmentAccessForMcp(
  value,
  { includeAttachmentDownloadUrl = false } = {}
) {
  const discloseDownloadUrl = value.operation === "download" &&
    includeAttachmentDownloadUrl === true;
  return {
    contract: "aralearn.mcp-course-source-attachment-access.v1",
    courseRevision: value.courseRevision ?? null,
    operation: value.operation ?? null,
    sourceId: value.sourceId ?? null,
    sourceRevision: value.sourceRevision ?? null,
    attachment: projectSourceAttachmentMetadataForMcp(value.attachment),
    uploadRequired: value.uploadRequired === true,
    alreadyLinked: value.alreadyLinked === true,
    ...(discloseDownloadUrl
      ? {
        signedUrl: value.signedUrl ?? null,
        expiresAt: value.expiresAt ?? null
      }
      : {}),
    dataDisclosure: attachmentMcpDisclosure(discloseDownloadUrl)
  };
}

/**
 * Projeta somente os recortes de dados necessários ao cliente MCP.
 * A aplicação continua recebendo os DTOs relacionais completos pelas próprias rotas.
 */
export function projectCourseToolResultForMcp(
  value,
  {
    includeObservationText = false,
    includeAttachmentDownloadUrl = false
  } = {}
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.contract === COURSE_SOURCES_CONTRACT) {
    return projectCourseSourcesForMcp(value);
  }
  if (COURSE_SOURCE_ATTACHMENT_ACCESS_CONTRACTS.has(value.contract)) {
    return projectSourceAttachmentAccessForMcp(value, {
      includeAttachmentDownloadUrl
    });
  }
  if (value.contract === MCP_ANNOTATION_PAGE_CONTRACT) {
    return {
      contract: "aralearn.mcp-anchored-annotation-page.v1",
      courseRevision: value.courseRevision ?? null,
      annotationSetVersion: value.annotationSetVersion ?? null,
      summary: {
        matchingTotal: value.summary?.matchingTotal ?? 0,
        byOrigin: { ...(value.summary?.byOrigin || {}) },
        byChannel: { ...(value.summary?.byChannel || {}) },
        byState: { ...(value.summary?.byState || {}) },
        unclassifiedTotal: value.summary?.unclassifiedTotal ?? 0
      },
      items: (Array.isArray(value.items) ? value.items : [])
        .map((item) => projectAnnotationForMcp(item, { includeObservationText }))
        .filter(Boolean),
      hasMore: value.hasMore === true,
      nextCursor: value.nextCursor ?? null,
      dataDisclosure: annotationMcpDisclosure(includeObservationText)
    };
  }
  if (value.contract === MCP_ANNOTATION_CHANGE_CONTRACT) {
    return {
      contract: "aralearn.mcp-anchored-annotation-change.v1",
      courseRevision: value.courseRevision ?? null,
      annotationSetVersion: value.annotationSetVersion ?? null,
      requestId: value.requestId ?? null,
      idempotent: value.idempotent === true,
      changed: value.changed === true,
      annotation: projectAnnotationForMcp(value.annotation),
      dataDisclosure: annotationMcpDisclosure(false)
    };
  }
  if (value.contract === MCP_AUDIT_CYCLE_PAGE_CONTRACT &&
      Array.isArray(value.context?.annotations)) {
    const projectedAudit = { ...value };
    delete projectedAudit.courseId;
    return {
      ...projectedAudit,
      context: {
        ...value.context,
        annotations: value.context.annotations
          .map((annotation) => projectSelectedAuditAnnotation(annotation, {
            includeObservationText
          }))
          .filter(Boolean)
      },
      dataDisclosure: {
        ...annotationMcpDisclosure(includeObservationText),
        purpose: "author_audit_context"
      }
    };
  }
  return value;
}

async function resourceLibraryResult(args, publicAppUrl) {
  const { RESOURCE_CATALOG } = await import(
    "../aralearn/runtime/resources/catalog/resourceCatalog.js"
  );
  const {
    operation,
    packages = [],
    studyUnitJson = null,
    query = "",
    intent = "",
    ...facets
  } = args;
  let result;
  if (operation === "explore") {
    result = RESOURCE_CATALOG.explore({ slot: args.slot });
  } else if (operation === "search") {
    result = RESOURCE_CATALOG.search({ ...facets, query, limit: facets.limit ?? 8 });
  } else if (operation === "inspect") {
    result = RESOURCE_CATALOG.inspect(packages);
  } else if (operation === "contracts") {
    if (packages.length > 1) {
      throw new AuthoringApiError(
        422,
        "component_contract_batch_too_large",
        "contracts aceita um componente didático exato por chamada."
      );
    }
    result = RESOURCE_CATALOG.contracts(packages);
  } else if (operation === "validate_study_unit") {
    result = RESOURCE_CATALOG.validateStudyUnit(parseStudyUnitJson(studyUnitJson));
  } else if (operation === "audit_representation") {
    result = RESOURCE_CATALOG.auditRepresentation({
      studyUnit: parseStudyUnitJson(studyUnitJson),
      intent: { ...facets, query: intent || query }
    });
  } else if (operation === "preview_study_unit") {
    const studyUnit = parseStudyUnitJson(studyUnitJson);
    if (args.studyUnitId && studyUnit.id !== args.studyUnitId) {
      throw new AuthoringApiError(
        422,
        "preview_study_unit_mismatch",
        "A Unidade informada não corresponde ao alvo persistido."
      );
    }
    result = {
      ...RESOURCE_CATALOG.previewStudyUnitDescriptor(studyUnit),
      deepLink: previewDeepLink(publicAppUrl, args.courseId, args.studyUnitId)
    };
  } else {
    throw new AuthoringApiError(
      422,
      "unknown_component_library_operation",
      `Operação desconhecida da biblioteca de componentes: ${operation}.`
    );
  }
  return {
    contract: "aralearn.instructional-component-library.v1",
    operation,
    availability: { source: "installed-catalog" },
    result
  };
}

function validatedSuccess(name, requestId, data, surface) {
  const envelope = { ok: true, requestId, data };
  if (surface === "application") {
    validateAuthoringApplicationToolOutput(name, envelope);
  } else {
    validateAuthoringMcpToolOutput(name, envelope);
  }
  return { requestId, data };
}

export async function executeCourseTool({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt,
  surface = "mcp",
  onRequestIdValidated = null
}) {
  const allowed = surface === "application"
    ? authoringApplicationToolIsAllowed(name, principal)
    : authoringMcpToolIsAllowed(name, principal);
  if (!allowed) {
    throw new AuthoringApiError(
      403,
      "insufficient_scope",
      "A sessão não permite usar esta ferramenta."
    );
  }
  const operation = surface === "application"
    ? mapAuthoringApplicationToolCall(name, rawArguments)
    : mapAuthoringMcpToolCall(name, rawArguments);
  if (typeof onRequestIdValidated === "function") {
    onRequestIdValidated(operation.requestId ?? null);
  }
  if (operation.kind === "resource-library") {
    return validatedSuccess(
      name,
      operation.requestId,
      await resourceLibraryResult(operation.body, adapter?.publicAppUrl),
      surface
    );
  }
  const headers = new Headers({ "Content-Type": "application/json" });
  if (operation.requestId) headers.set("Idempotency-Key", operation.requestId);
  const request = new Request(`https://aralearn.invalid${operation.path}`, {
    method: operation.method,
    headers,
    ...(operation.body == null ? {} : { body: JSON.stringify(operation.body) })
  });
  const result = await executeCourseRoute({
    request,
    route: routeCourseRequest(operation.method, new URL(request.url).pathname),
    adapter,
    principal,
    deadlineAt
  });
  const data = surface === "mcp"
    ? projectCourseToolResultForMcp(result.data, {
        includeObservationText: rawArguments?.includeObservationText === true,
        includeAttachmentDownloadUrl:
          rawArguments?.includeAttachmentDownloadUrl === true
      })
    : result.data;
  return validatedSuccess(name, result.requestId, data, surface);
}
