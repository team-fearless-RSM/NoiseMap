const CACHE_NAME = "noisemap-shell-v1";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./icons/noisemap.svg",
  "./css/style.css", "./js/app.js", "./js/firebase.js",
  "./js/audio-alerts.js", "./js/export-csv.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("noisemap-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Cache the Firebase compat SDK after the first online visit so the app shell
  // can still start when the school connection drops.
  if (url.origin !== self.location.origin) {
    if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/10.12.5/")) {
      event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })));
    }
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});