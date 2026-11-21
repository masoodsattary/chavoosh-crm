const CACHE_NAME = "chavoosh-crm-shell-v2";
const SHELL = [
  "/offline.html",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/chavoosh-crm-icon-192.png",
  "/chavoosh-crm-icon-512.png",
  "/chavoosh-crm-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request).catch(() =>
      request.mode === "navigate" ? caches.match("/offline.html") : caches.match(request),
    ),
  );
});
