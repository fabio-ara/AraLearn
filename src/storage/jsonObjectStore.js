function assertStore(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("Store inválido para dados locais.");
  }
}

export function readStoredObject(storage, key) {
  assertStore(storage);
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`JSON local inválido na chave "${key}".`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Objeto local inválido na chave "${key}".`);
  }
  return parsed;
}

export function writeStoredObject(storage, key, value) {
  assertStore(storage);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Valor inválido para a chave local "${key}".`);
  }
  return storage.setItem(key, JSON.stringify(value));
}
