const C = "ofs-v1";
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => c.addAll(["/", "/style.css", "/app.js", "/icon.svg", "/manifest.webmanifest"])));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && r.status === 200) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
