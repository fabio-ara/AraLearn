import { loadIntentV1Source } from "./loadIntentV1Source.js";
import { normalizeIntentV1Document } from "./normalizeIntentV1Document.js";
import { compileIntentV1Document } from "../model/compileIntentV1.js";

export function buildIntentV1Runtime(source) {
  let loadedDocument;

  try {
    loadedDocument = loadIntentV1Source(source);
  } catch (error) {
    return {
      ok: false,
      stage: "load",
      errors: [
        {
          path: "$",
          message: error.message
        }
      ]
    };
  }

  const normalized = normalizeIntentV1Document(loadedDocument);

  if (!normalized.ok) {
    return {
      ok: false,
      stage: "validate",
      errors: normalized.errors
    };
  }

  const compiled = compileIntentV1Document(normalized.value);

  return {
    ok: true,
    stages: ["load", "validate", "normalize", "compile"],
    loaded: loadedDocument,
    normalized: normalized.value,
    compiled
  };
}
