const CACHE_NAME = "gp-web-shell-v1";
const SHELL_PATHS = [
  "./index.html",
  "./manifest.webmanifest",
  "./pwa.js",
  "./web-app.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "../resources/styles.css",
  "../resources/js/main.js",
  "../resources/js/kit-maker.mjs",
  "../resources/icons/geeky-punks-logo.svg",
];

const SHELL_URLS = new Set(SHELL_PATHS.map((path) => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll([...SHELL_URLS]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);
  if (requestURL.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match(INDEX_URL);
      })
    );
    return;
  }

  if (!SHELL_URLS.has(requestURL.href)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      cache.put(request, response.clone());
      return response;
    })
  );
});
