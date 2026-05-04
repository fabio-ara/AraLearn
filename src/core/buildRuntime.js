import { loadJsonSource } from "./loadJsonSource.js";
import { validateContractDocument } from "../contract/validateContract.js";
import { compileContractDocument } from "../model/compileContract.js";

export function buildRuntime(source) {
  let loadedDocument;

  try {
    loadedDocument = loadJsonSource(source);
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

  const normalized = validateContractDocument(loadedDocument);
  if (!normalized.ok) {
    return {
      ok: false,
      stage: "validate",
      errors: normalized.errors
    };
  }

  const compiled = compileContractDocument(normalized.value);

  return {
    ok: true,
    stages: ["load", "validate", "normalize", "compile"],
    loaded: loadedDocument,
    normalizedDocument: normalized.value,
    compiled
  };
}
