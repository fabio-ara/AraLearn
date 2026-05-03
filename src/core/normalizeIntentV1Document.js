import { validateIntentV1Document } from "../contract/validateIntentV1.js";

export function normalizeIntentV1Document(document) {
  const result = validateIntentV1Document(document);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    value: result.value
  };
}
