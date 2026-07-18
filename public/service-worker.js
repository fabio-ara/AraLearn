const CACHE_PREFIX = "aralearn-shell-";
const CACHE_NAME = `${CACHE_PREFIX}0.1.0-r2`;
const SHELL = [
  "./",
  "./index.html",
  "./frame-guard.js",
  "./styles-shell-baseline.css",
  "./styles.css",
  "./main.js",
  "./assets/brand/aralearn-mark.png"
];

async function installShell() {
  let assets = SHELL;
  try {
    const response = await fetch("./asset-manifest.json", { cache: "no-store" });
    if (response.ok) {
      const manifest = await response.json();
      if (Array.isArray(manifest.assets)) assets = [...new Set([...SHELL, ...manifest.assets])];
    }
  } catch {
    // O servidor de desenvolvimento não precisa gerar manifesto; o shell mínimo continua disponível.
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(assets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Códigos PKCE e erros de autenticação chegam na query da navegação. A
    // resposta pode ser usada, mas a URL sensível nunca vira chave persistida.
    if (response.ok && !new URL(request.url).search) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || cache.match("./index.html");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const networkFirstRequest =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/runtime-config.js");
  event.respondWith(networkFirstRequest ? networkFirst(event.request) : cacheFirst(event.request));
});
