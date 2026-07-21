export const DEVICE_ID_STATE_KEY = "sync.device-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getOrCreateDeviceId(store, cryptoValue = globalThis.crypto) {
  if (!store || typeof store.getSyncState !== "function" || typeof store.putSyncState !== "function") {
    throw new TypeError("Store relacional inválido para identidade do dispositivo.");
  }
  const stored = await store.getSyncState(DEVICE_ID_STATE_KEY);
  const current = typeof stored === "string" ? stored : stored?.value;
  if (typeof current === "string" && UUID_PATTERN.test(current)) return current;
  if (typeof cryptoValue?.randomUUID !== "function") {
    throw new Error("O ambiente não oferece geração segura de UUID para o dispositivo.");
  }
  const deviceId = cryptoValue.randomUUID();
  if (!UUID_PATTERN.test(deviceId)) throw new Error("O gerador retornou uma identidade de dispositivo inválida.");
  await store.putSyncState(DEVICE_ID_STATE_KEY, deviceId);
  return deviceId;
}
