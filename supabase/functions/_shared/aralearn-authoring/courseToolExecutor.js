import { AuthoringApiError } from "./errors.js";
import { routeCourseRequest } from "./courseProtocol.js";
import { executeCourseRoute } from "./courseRouter.js";
import {
  authoringApplicationToolIsAllowed,
  authoringMcpToolIsAllowed,
  authoringProtocolV1ToolIsAllowed,
  mapAuthoringApplicationToolCall,
  mapAuthoringProtocolV1Call,
  resolveAuthoringMcpToolCall,
  validateAuthoringApplicationToolOutput,
  validateAuthoringMcpToolOutput
} from "./courseMcpTools.js";
import { courseAuthoringGuidanceForCall } from "./courseKnowledge.js";
import { resolveOpenAiTemporaryPdf } from "./openAiTemporaryPdf.js";
import { normalizeCourseSourcePdfIngestion } from
  "../aralearn/runtime/domain/courseSources.js";
import { withTrustedCreationIdentities } from "./trustedCreationIdentity.js";

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
      `?section=content&studyUnitId=${encodeURIComponent(studyUnitId)}`
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
const COURSE_SOURCE_PDF_INGESTION_CONTRACT =
  "aralearn.course-source-pdf-ingestion.v1";
const MCP_ATTACHMENT_DOWNLOAD_EXPIRY_SECONDS = 60;

function confirmedCourseSourcePdfIngestion(value) {
  try {
    return normalizeCourseSourcePdfIngestion(value);
  } catch {
    throw new AuthoringApiError(
      502,
      "course_source_pdf_persistence_unconfirmed",
      "O AraLearn não confirmou que o PDF foi mantido entre as Fontes do Curso."
    );
  }
}

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
      id: annotation.target?.id ?? null,
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

function annotationMcpDisclosure(includeObservationText, recipient) {
  return {
    recipient,
    purpose: "author_triage",
    rawObservationTextIncluded: includeObservationText,
    omitted: [
      "courseId",
      "contributor.ref",
      "contributor.label",
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
    target: {
      kind: annotation.target?.kind ?? null,
      id: annotation.target?.id ?? null
    },
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
          humanLocator: anchor?.humanLocator ?? null,
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

function sourceMcpDisclosure(projectedItems, recipient) {
  const projectedSelectors = (Array.isArray(projectedItems) ? projectedItems : [])
    .flatMap((item) => Array.isArray(item?.anchors) ? item.anchors : [])
    .map((anchor) => anchor?.selector)
    .filter((selector) => selector && typeof selector === "object" && !Array.isArray(selector));
  const selectorDisclosurePaths = ["exact", "prefix", "suffix", "fragment"]
    .filter((field) => projectedSelectors.some((selector) => Object.hasOwn(selector, field)))
    .map((field) => `items[].anchors[].selector.${field}`);
  return {
    recipient,
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
      "items[].anchors[].humanLocator",
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

function projectCourseSourcesForMcp(value, recipient) {
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
    dataDisclosure: sourceMcpDisclosure(items, recipient)
  };
}

function attachmentMcpDisclosure(includeAttachmentDownloadUrl, recipient) {
  return {
    recipient,
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
  { includeAttachmentDownloadUrl = false, recipient } = {}
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
    dataDisclosure: attachmentMcpDisclosure(discloseDownloadUrl, recipient)
  };
}

function projectSourcePdfIngestionForMcp(value, recipient) {
  return {
    contract: "aralearn.mcp-course-source-pdf-ingestion.v1",
    courseRevision: value.courseRevision ?? null,
    requestId: value.requestId ?? null,
    idempotent: value.idempotent === true,
    changed: value.changed === true,
    stored: value.stored === true,
    source: {
      sourceId: value.source?.sourceId ?? null,
      sourceRevision: value.source?.sourceRevision ?? null,
      bibliographyChanged: value.source?.bibliographyChanged === true
    },
    technicalDetails: {
      contentHash: value.attachment?.contentHash ?? null,
      byteSize: value.attachment?.byteSize ?? null,
      mediaType: value.attachment?.mediaType ?? null,
      storagePath: value.attachment?.storagePath ?? null
    },
    dataDisclosure: {
      recipient,
      purpose: "author_requested_source_persistence",
      technicalDetailsMachineFacing: true,
      omitted: ["courseId", "attachment.actorId"]
    }
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
    includeAttachmentDownloadUrl = false,
    recipient = "connected_mcp_client"
  } = {}
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.contract === COURSE_SOURCES_CONTRACT) {
    return projectCourseSourcesForMcp(value, recipient);
  }
  if (COURSE_SOURCE_ATTACHMENT_ACCESS_CONTRACTS.has(value.contract)) {
    return projectSourceAttachmentAccessForMcp(value, {
      includeAttachmentDownloadUrl,
      recipient
    });
  }
  if (value.contract === COURSE_SOURCE_PDF_INGESTION_CONTRACT) {
    return projectSourcePdfIngestionForMcp(value, recipient);
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
      dataDisclosure: annotationMcpDisclosure(includeObservationText, recipient)
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
      dataDisclosure: annotationMcpDisclosure(false, recipient)
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
        ...annotationMcpDisclosure(includeObservationText, recipient),
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
  const packageRequests = packages.map((identity) => {
    const match = /^(.+)@(\d+\.\d+\.\d+)$/u.exec(String(identity || "").trim());
    return match
      ? { packageId: match[1], version: match[2] }
      : identity;
  });
  const structuredIntentFields = [
    "slot", "studyUnitRole", "disciplineIds", "structureIds", "taskOperationIds",
    "practiceModeIds", "knowledgeObjects", "mustPreserve", "notationIsLearningObject"
  ];
  const hasStructuredIntent = structuredIntentFields.some((field) => (
    Object.hasOwn(facets, field)
  ));
  const catalogQuery = query || (hasStructuredIntent ? "" : intent);
  const producerDeclaration = {
    epistemicStatus: "producer_declaration_not_backend_verified",
    query: query || null,
    intent: intent || null,
    facets: Object.fromEntries(structuredIntentFields
      .filter((field) => Object.hasOwn(facets, field))
      .map((field) => [field, structuredClone(facets[field])]))
  };
  let result;
  if (operation === "explore") {
    result = RESOURCE_CATALOG.explore({ slot: args.slot });
  } else if (operation === "search") {
    result = RESOURCE_CATALOG.search({
      ...facets,
      query: catalogQuery,
      limit: facets.limit ?? 8
    });
  } else if (operation === "inspect") {
    result = RESOURCE_CATALOG.inspect(packageRequests);
  } else if (operation === "contracts") {
    if (packages.length > 1) {
      throw new AuthoringApiError(
        422,
        "component_contract_batch_too_large",
        "contracts aceita um componente didático exato por chamada."
      );
    }
    result = RESOURCE_CATALOG.contracts(packageRequests);
  } else if (operation === "validate_study_unit") {
    result = RESOURCE_CATALOG.validateStudyUnit(parseStudyUnitJson(studyUnitJson));
  } else if (operation === "audit_representation") {
    result = RESOURCE_CATALOG.auditRepresentation({
      studyUnit: parseStudyUnitJson(studyUnitJson),
      intent: { ...facets, query: catalogQuery }
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
    ...(new Set(["search", "audit_representation"]).has(operation)
      ? { producerDeclaration }
      : {}),
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
  projectionRecipient = "connected_mcp_client",
  applicationInspectionVersion = 1,
  onRequestIdValidated = null
}) {
  const allowed = surface === "application"
    ? authoringApplicationToolIsAllowed(name, principal)
    : surface === "mcp"
      ? authoringMcpToolIsAllowed(name, principal)
      : authoringProtocolV1ToolIsAllowed(name, principal);
  if (!allowed) {
    throw new AuthoringApiError(
      403,
      "insufficient_scope",
      "A sessão não permite usar esta ferramenta."
    );
  }
  const resolved = surface === "mcp"
    ? resolveAuthoringMcpToolCall(name, rawArguments)
    : { canonicalToolName: name, rawArguments };
  const trustedArguments = await withTrustedCreationIdentities(
    resolved.canonicalToolName,
    resolved.rawArguments
  );
  const operation = surface === "application"
    ? mapAuthoringApplicationToolCall(name, trustedArguments, {
        inspectionVersion: applicationInspectionVersion
      })
    : mapAuthoringProtocolV1Call(resolved.canonicalToolName, trustedArguments);
  if (typeof onRequestIdValidated === "function") {
    onRequestIdValidated(operation.requestId ?? null);
  }
  if (operation.kind === "resource-library") {
    const data = await resourceLibraryResult(operation.body, adapter?.publicAppUrl);
    const phaseGuidance = surface === "mcp"
      ? courseAuthoringGuidanceForCall(name, rawArguments)
      : null;
    return validatedSuccess(
      name,
      operation.requestId,
      phaseGuidance ? { ...data, phaseGuidance } : data,
      surface
    );
  }
  if (operation.kind === "course-source-pdf-ingestion") {
    if (typeof adapter?.ingestCourseSourcePdf !== "function") {
      throw new AuthoringApiError(
        503,
        "course_source_pdf_ingestion_unavailable",
        "O AraLearn não conseguiu receber este documento agora."
      );
    }
    const ingestion = {
      principal,
      courseId: operation.body.courseId,
      expectedCourseRevision: operation.body.expectedCourseRevision,
      requestId: operation.body.requestId,
      sourceIntent: operation.body.sourceIntent,
      fileIdentity: {
        fileId: operation.body.pdf.file_id,
        fileName: operation.body.pdf.file_name ?? null,
        mediaType: operation.body.pdf.mime_type ?? null
      },
      deadlineAt
    };
    let result = typeof adapter?.getCourseSourcePdfIngestionReceipt === "function"
      ? await adapter.getCourseSourcePdfIngestionReceipt(ingestion)
      : null;
    if (result === null) {
      const bytes = await resolveOpenAiTemporaryPdf({
        descriptor: operation.body.pdf,
        fetchImpl: adapter.fetchImpl ?? globalThis.fetch,
        deadlineAt
      });
      result = confirmedCourseSourcePdfIngestion(await adapter.ingestCourseSourcePdf({
        ...ingestion,
        bytes,
        mediaType: "application/pdf"
      }));
    } else {
      result = confirmedCourseSourcePdfIngestion(result);
    }
    const data = surface === "mcp"
      ? projectCourseToolResultForMcp(result, { recipient: projectionRecipient })
      : result;
    return validatedSuccess(name, operation.requestId, data, surface);
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
  let data = surface === "mcp"
    ? projectCourseToolResultForMcp(result.data, {
        includeObservationText: rawArguments?.includeObservationText === true,
        includeAttachmentDownloadUrl:
          rawArguments?.includeAttachmentDownloadUrl === true,
        recipient: projectionRecipient
      })
    : result.data;
  const phaseGuidance = surface === "mcp"
    ? courseAuthoringGuidanceForCall(name, rawArguments)
    : null;
  if (phaseGuidance && data && typeof data === "object" && !Array.isArray(data)) {
    data = { ...data, phaseGuidance };
  }
  return validatedSuccess(name, result.requestId, data, surface);
}
