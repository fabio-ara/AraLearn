const CACHE_PREFIX = "aralearn-shell-";

async function disableDevelopmentServiceWorker({ navigatorValue, cacheStorage, locationValue }) {
  const registrations = await navigatorValue.serviceWorker.getRegistrations?.() || [];
  const currentScope = new URL("./", locationValue.href).href;
  await Promise.all(
    registrations
      .filter((registration) => registration.scope === currentScope)
      .map((registration) => registration.unregister())
  );
  if (cacheStorage?.keys && cacheStorage?.delete) {
    const cacheKeys = await cacheStorage.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .map((key) => cacheStorage.delete(key))
    );
  }
}

export async function registerAraLearnServiceWorker(
  navigatorValue = globalThis.navigator,
  {
    environment = globalThis.__ARALEARN_ENV__,
    cacheStorage = globalThis.caches,
    locationValue = globalThis.location
  } = {}
) {
  if (!navigatorValue?.serviceWorker || globalThis.AndroidHost) return null;
  if (environment?.developmentRuntime === true) {
    await disableDevelopmentServiceWorker({ navigatorValue, cacheStorage, locationValue });
    return null;
  }
  return navigatorValue.serviceWorker.register("./service-worker.js", {
    scope: "./",
    updateViaCache: "none"
  });
}
