export async function registerAraLearnServiceWorker(navigatorValue = globalThis.navigator) {
  if (!navigatorValue?.serviceWorker || globalThis.AndroidHost) return null;
  return navigatorValue.serviceWorker.register("./service-worker.js", { scope: "./" });
}
