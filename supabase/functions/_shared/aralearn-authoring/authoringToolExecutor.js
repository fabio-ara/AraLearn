import { routeRequest } from "./protocol.js";
import { executeAuthoringRoute } from "./authoringRouter.js";
import { prepareAuthoringContext } from "./authoringKnowledge.js";
import { AuthoringApiError } from "./errors.js";
import { RESOURCE_CATALOG } from "../aralearn/runtime/resources/catalog/resourceCatalog.js";
import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "./workspaceMcpTools.js";

function hideInternalLifecycle(value) {
  if (Array.isArray(value)) return value.map(hideInternalLifecycle);
  if (!value || typeof value !== "object") return value;
  const internalMicrosequenceStatus = new Set([
    "planned",
    "generated",
    "needs_review",
    "ready"
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "completionState" && !(
      key === "status" && internalMicrosequenceStatus.has(value.status)
    ))
    .map(([key, item]) => [key, hideInternalLifecycle(item)]));
}

function parseCardJson(cardJson) {
  try {
    return JSON.parse(cardJson);
  } catch {
    throw new AuthoringApiError(
      422,
      "invalid_card_json",
      "cardJson precisa conter JSON válido."
    );
  }
}

function resourceLibraryResult(args) {
  const {
    operation,
    packages = [],
    cardJson = null,
    query = "",
    intent = "",
    ...facets
  } = args;
  let result;
  if (operation === "explore") {
    result = RESOURCE_CATALOG.explore({ slot: args.slot });
  } else if (operation === "search") {
    result = RESOURCE_CATALOG.search({
      ...facets,
      query,
      limit: facets.limit ?? 8
    });
  } else if (operation === "inspect") {
    result = RESOURCE_CATALOG.inspect(packages);
  } else if (operation === "contracts") {
    if (packages.length > 4) {
      throw new AuthoringApiError(
        422,
        "resource_contract_batch_too_large",
        "contracts aceita no máximo quatro packages por chamada."
      );
    }
    result = RESOURCE_CATALOG.contracts(packages);
  } else if (operation === "validate_card") {
    result = RESOURCE_CATALOG.validateCard(parseCardJson(cardJson));
  } else if (operation === "audit_representation") {
    result = RESOURCE_CATALOG.auditRepresentation({
      card: parseCardJson(cardJson),
      intent: {
        ...facets,
        query: intent || query
      }
    });
  } else if (operation === "preview_card") {
    result = RESOURCE_CATALOG.previewDescriptor(parseCardJson(cardJson));
  } else {
    throw new AuthoringApiError(
      422,
      "unknown_resource_library_operation",
      `Operação desconhecida da biblioteca de resources: ${operation}.`
    );
  }
  return {
    contract: "aralearn.resource-library.v1",
    operation,
    result
  };
}

function validatedSuccess(name, requestId, data) {
  const envelope = {
    ok: true,
    requestId,
    data: hideInternalLifecycle(data)
  };
  validateAuthoringMcpToolOutput(name, envelope);
  return {
    requestId,
    data: envelope.data
  };
}

export async function executeAuthoringTool({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt
}) {
  const operation = mapAuthoringMcpToolCall(name, rawArguments);
  if (operation.kind === "knowledge") {
    const unknownPackageIds = (operation.body.packageIds || []).filter(
      (packageId) => !RESOURCE_CATALOG.getProfile(packageId)
    );
    if (unknownPackageIds.length) {
      throw new AuthoringApiError(
        422,
        "unknown_resource_package",
        `Packages inexistentes: ${unknownPackageIds.join(", ")}.`
      );
    }
    const availableTools = authoringMcpToolsForPrincipal(principal)
      .map((definition) => definition.name);
    const available = new Set(availableTools);
    const context = prepareAuthoringContext(operation.body);
    return validatedSuccess(name, operation.requestId, {
        ...context,
        recommendedTools: context.recommendedTools.filter((toolName) => available.has(toolName)),
        access: {
          profile: available.has("decidirRevisaoEditorial")
            || available.has("editarCatalogo")
            ? "catalog_editor"
            : "private_author",
          privateAuthoring: available.has("criarWorkspaceDeAutoria"),
          submitForCatalogReview: available.has("submeterCursoParaRevisaoEditorial"),
          reviewSubmissions: available.has("decidirRevisaoEditorial"),
          publishCatalog: available.has("publicarCursoDoWorkspace")
            && (principal.scopes || []).some(
              (scope) => scope === "*" || scope === "catalog:publish"
            ),
          manageCatalog: available.has("editarCatalogo"),
          availableTools
        }
    });
  }
  if (operation.kind === "resource-library") {
    try {
      return validatedSuccess(
        name,
        operation.requestId,
        resourceLibraryResult(operation.body)
      );
    } catch (error) {
      if (error instanceof AuthoringApiError) throw error;
      if (error instanceof RangeError || error instanceof TypeError) {
        throw new AuthoringApiError(
          422,
          "invalid_resource_library_request",
          error instanceof Error ? error.message : "A consulta à biblioteca de resources é inválida."
        );
      }
      throw error;
    }
  }

  const toolPrincipal = { ...principal };
  Object.defineProperty(toolPrincipal, "transport", {
    value: "authoring-tool",
    enumerable: false
  });
  const headers = new Headers({
    "Idempotency-Key": operation.requestId,
    "Content-Type": "application/json"
  });
  const request = new Request(`https://aralearn.invalid${operation.path}`, {
    method: operation.method,
    headers,
    ...(operation.body == null ? {} : { body: JSON.stringify(operation.body) })
  });
  const route = routeRequest(operation.method, new URL(request.url).pathname);
  const result = await executeAuthoringRoute({
    request,
    route,
    adapter,
    principal: toolPrincipal,
    deadlineAt
  });
  return validatedSuccess(name, operation.requestId, result.data);
}
