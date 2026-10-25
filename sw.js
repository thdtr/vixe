// Network first, cache as fallback: always fresh online, still playable offline.
// On a slow network the cached copy is served after a short wait, and the
// fetch keeps going in the background to refresh the cache for next time.
const CACHE = 'vixe-v1';
const PATIENCE = 2000;   // ms to wait for the network when a cached copy exists

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  const net = fetch(req);
  // Whatever the network brings refreshes the cache, even if the race was lost.
  e.waitUntil(net.then((res) => {
    if (!res.ok) return;
    const copy = res.clone();
    return caches.open(CACHE).then((c) => c.put(req, copy));
  }).catch(() => {}));
  const cached = caches.match(req, { ignoreSearch: true });
  const late = new Promise((r) => setTimeout(r, PATIENCE)).then(() => cached).then((c) => c || net);
  e.respondWith(
    Promise.race([net, late]).catch(() => cached.then((c) => c || Response.error())),
  );
});
