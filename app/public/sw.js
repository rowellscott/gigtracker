/* Service worker for the Angular-rewrite PREVIEW build only.
 *
 * Registered from a page under /gigtracker/preview/, so its scope is
 * limited to that subpath -- it can never intercept or cache the live app
 * at /gigtracker/. The cache name is deliberately distinct from the legacy
 * app's ('gigtracker-v3'/'v4') for the same reason.
 *
 * Strategy: cache-first with runtime population. Build assets are content
 * hashed, so a stale entry is never wrong -- a new deploy ships new
 * filenames and the old cache is dropped on activate. */
const CACHE = 'gigtracker-preview-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
