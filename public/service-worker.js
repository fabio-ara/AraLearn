const CACHE_PREFIX = "aralearn-shell-v2-";
const OBSOLETE_CACHE_PREFIXES = ["aralearn-shell-"];
const CACHE_NAME = `${CACHE_PREFIX}__ARALEARN_CACHE_REVISION__`;
const SHELL = [
  "./",
  "./index.html",
  "./frame-guard.js",
  "./theme-bootstrap.js",
  "./styles-tokens.css",
  "./styles-shell-baseline.css",
  "./styles.css",
  "./course-authoring.css",
  "./vendor/vega.min.js",
  "./vendor/vega-interpreter.js",
  "./vendor/vega-lite.min.js",
  "./vendor/venn.esm.js",
  "./vendor/viz-global.js",
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
          .filter((key) => key !== CACHE_NAME &&
            OBSOLETE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // O shell precisa buscar a versão atual quando há rede. O cache existe como
  // fallback offline, nunca como fonte preferencial de JavaScript ou CSS.
  event.respondWith(networkFirst(event.request));
});
