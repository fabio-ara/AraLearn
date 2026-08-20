const AUTHORING_STATE_FIELDS = Object.freeze([
  "version", "parts", "decisions", "mandate"
]);

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeCourseAuthoringState(value) {
  if (!plainObject(value) ||
      Object.keys(value).length !== AUTHORING_STATE_FIELDS.length ||
      AUTHORING_STATE_FIELDS.some((field) => !Object.hasOwn(value, field)) ||
      value.version !== 1 ||
      !Array.isArray(value.parts) || value.parts.length > 64 ||
      !Array.isArray(value.decisions) || value.decisions.length > 512 ||
      (value.mandate !== null && !plainObject(value.mandate)) ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > 1_048_576) {
    throw new TypeError("Estado de autoria inválido.");
  }
  return structuredClone(value);
}
