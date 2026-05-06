import { buildRuntime } from "../core/buildRuntime.js";
import { renderContractDocument } from "./renderContractDocument.js";

export function renderRuntime(source) {
  const runtime = buildRuntime(source);

  if (!runtime.ok) {
    return runtime;
  }

  return {
    ok: true,
    stages: [...runtime.stages, "render"],
    loaded: runtime.loaded,
    normalizedDocument: runtime.normalizedDocument,
    compiled: runtime.compiled,
    rendered: {
      html: renderContractDocument(runtime.compiled)
    }
  };
}
