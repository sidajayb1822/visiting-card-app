/**
 * Minimal service worker.
 *
 * Its job is to satisfy Chrome's installability requirement (a registered
 * worker with a fetch handler) and to cache the icons. It deliberately does not
 * cache pages or API responses: scanning needs the network anyway, and a stale
 * cached shell is a classic source of "I deployed but nothing changed".
 */

const CACHE = "card-scanner-v1";
const ASSETS = ["/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Icons missing shouldn't block activation.
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything that isn't a plain GET of our own static assets.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
