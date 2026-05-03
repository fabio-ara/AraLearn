import { buildIntentV1Runtime } from "../core/buildIntentV1Runtime.js";
import { renderHtmlDocument } from "./renderHtmlDocument.js";

export function renderIntentV1Runtime(source) {
  const runtime = buildIntentV1Runtime(source);

  if (!runtime.ok) {
    return runtime;
  }

  return {
    ok: true,
    stages: [...runtime.stages, "render"],
    loaded: runtime.loaded,
    normalized: runtime.normalized,
    compiled: runtime.compiled,
    rendered: {
      html: renderHtmlDocument(runtime.compiled)
    }
  };
}
