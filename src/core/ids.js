import { slugify } from "./text.js";

export function buildScopedKey(scope, label, fallback = "") {
  const suffix = slugify(label) || slugify(fallback) || scope;
  return `${scope}-${suffix}`;
}

export function createKeyAllocator(scope) {
  const used = new Set();
  return {
    next(preferred, label, fallback = "") {
      const raw = typeof preferred === "string" && preferred.trim() ? preferred.trim() : buildScopedKey(scope, label, fallback);
      if (!used.has(raw)) {
        used.add(raw);
        return raw;
      }
      let counter = 2;
      let candidate = `${raw}-${counter}`;
      while (used.has(candidate)) {
        counter += 1;
        candidate = `${raw}-${counter}`;
      }
      used.add(candidate);
      return candidate;
    }
  };
}

