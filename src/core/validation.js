export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function makeError(path, message) {
  return { path, message };
}

export function pushError(errors, path, message) {
  errors.push(makeError(path, message));
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function finalizeValidation(errors, value) {
  if (errors.length) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}

