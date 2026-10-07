const CACHE = "money-os-v36";
const ASSETS = ["./","./index.html","./app.js?v=36","./styles.css?v=36","./manifest.webmanifest","./icon.svg"];
const LOGO_HOSTS = new Set(["www.google.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isBrandLogo = LOGO_HOSTS.has(url.hostname) && url.pathname === "/s2/favicons";

  if (!isLocal && !isBrandLogo) return;

  if (isBrandLogo) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok || response.type === "opaque") {
          cache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        const fallback = await cache.match(event.request);
        if (fallback) return fallback;
        throw error;
      }
    })());
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        throw new Error("Offline and asset not cached");
      })
  );
});
