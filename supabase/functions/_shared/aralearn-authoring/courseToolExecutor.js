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
import { RESOURCE_CATALOG } from "../aralearn/runtime/resources/catalog/resourceCatalog.js";

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

function resourceLibraryResult(args) {
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
    result = RESOURCE_CATALOG.previewStudyUnitDescriptor(
      parseStudyUnitJson(studyUnitJson)
    );
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
  surface = "mcp"
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
  if (operation.kind === "resource-library") {
    return validatedSuccess(
      name,
      operation.requestId,
      resourceLibraryResult(operation.body),
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
  return validatedSuccess(name, result.requestId, result.data, surface);
}
