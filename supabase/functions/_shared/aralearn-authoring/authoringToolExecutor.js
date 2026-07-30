import { routeRequest } from "./protocol.js";
import { executeAuthoringRoute } from "./routerV4.js";
import { prepareAuthoringContext } from "./authoringKnowledge.js";
import { mapAuthoringMcpToolCall } from "./workspaceMcpTools.js";

export async function executeAuthoringTool({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt
}) {
  const operation = mapAuthoringMcpToolCall(name, rawArguments);
  if (operation.kind === "knowledge") {
    return {
      requestId: operation.requestId,
      data: prepareAuthoringContext(operation.body)
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
    data: result.data
  };
}
