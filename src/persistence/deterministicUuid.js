const textEncoder = new TextEncoder();

function uuidBytesToString(bytes) {
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32)
  ].join("-");
}

/**
 * Produz um UUID v8 estável para uma chave natural. O SHA-256 fica restrito à
 * derivação da identidade; nenhum dado de domínio é persistido no identificador.
 */
export async function deterministicUuid(naturalKey, cryptoValue = globalThis.crypto) {
  if (!cryptoValue?.subtle?.digest) {
    throw new Error("A identidade relacional determinística exige Web Crypto com SHA-256.");
  }
  const bytes = textEncoder.encode(String(naturalKey));
  const digest = new Uint8Array(await cryptoValue.subtle.digest("SHA-256", bytes));
  const uuidBytes = digest.slice(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x80;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  return uuidBytesToString(uuidBytes);
}

export function relationalNaturalKey(entityType, userId, entityId) {
  if (!entityType || !userId || !entityId) {
    throw new TypeError("A identidade natural relacional exige tipo, usuário e entidade.");
  }
  return `aralearn:v1:${entityType}:${userId}:${entityId}`;
}
