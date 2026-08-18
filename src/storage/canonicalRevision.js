function serialize(value, ancestors, path) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Número não finito em ${path}.`);
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (typeof value === "undefined") throw new TypeError(`Campo undefined em ${path}.`);
  if (typeof value !== "object") throw new TypeError(`Valor não serializável em ${path}.`);
  if (ancestors.has(value)) throw new TypeError(`Referência circular em ${path}.`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item, index) =>
        serialize(item, ancestors, `${path}[${index}]`)
      ).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Objeto não JSON em ${path}.`);
    }
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${serialize(value[key], ancestors, `${path}.${key}`)}`
    ).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalRevisionString(value) {
  return serialize(value, new Set(), "$");
}

export async function canonicalRevisionHash(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto não está disponível.");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRevisionString(value))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
