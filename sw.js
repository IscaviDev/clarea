/* Service worker: keeps the whole study app on the device so it opens without internet.
   Cached copy first; when there is connection it refreshes the cache for next time. */
const CACHE = "clarea-20261111221431";
const CORE = ["./", "./index.html", "./repaso-pj6.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function pageKey(req){ return /repaso-pj6\.html/.test(new URL(req.url).pathname) ? "./repaso-pj6.html" : "./index.html"; }

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isPage = req.mode === "navigate";
  e.respondWith(
    caches.match(isPage ? pageKey(req) : req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(isPage ? pageKey(req) : req, copy));
        }
        return res;
      }).catch(() => hit || Response.error());
      return hit || fresh;
    })
  );
});
