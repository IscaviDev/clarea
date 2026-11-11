/* Clarea service worker.
   - Each published version has its own cache, filled when the new version is downloaded.
   - The new version waits until the user taps "Actualizar" (message SKIP_WAITING), then the page reloads.
   - Works without internet: everything is answered from the cache. */
const CACHE = "clarea-20261111233144";
const CORE = ["./", "./index.html", "./repaso-pj6.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

function pageKey(req){ return /repaso-pj6\.html/.test(new URL(req.url).pathname) ? "./repaso-pj6.html" : "./index.html"; }

self.addEventListener("install", e => {
  // download the new version completely (bypassing the browser cache), but don't take over yet
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, {cache: "reload"})))));
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const mine = await caches.open(CACHE);
    for (const k of await caches.keys()) {
      if (k === CACHE) continue;
      // keep the downloaded fonts so the app still looks right offline, then drop the old version
      const old = await caches.open(k);
      for (const req of await old.keys()) if (/fonts\.(googleapis|gstatic)\.com/.test(req.url)) { const r = await old.match(req); if (r) await mine.put(req, r); }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isPage = req.mode === "navigate";
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(isPage ? pageKey(req) : req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque") && !isPage) c.put(req, res.clone());
      return res;
    }).catch(() => hit || Response.error()))
  ));
});
