import { routeRequest } from "./protocol.js";
import { executeAuthoringRoute } from "./routerV4.js";
import { prepareAuthoringContext } from "./authoringKnowledge.js";
import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
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

export async function executeAuthoringTool({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt
}) {
  const operation = mapAuthoringMcpToolCall(name, rawArguments);
  if (operation.kind === "knowledge") {
    const availableTools = authoringMcpToolsForPrincipal(principal)
      .map((definition) => definition.name);
    const available = new Set(availableTools);
    const context = prepareAuthoringContext(operation.body);
    return {
      requestId: operation.requestId,
      data: {
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
      }
    };
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
  return {
    requestId: operation.requestId,
    data: hideInternalLifecycle(result.data)
  };
}
