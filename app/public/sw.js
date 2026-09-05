/* Service worker for the Angular-rewrite PREVIEW build only.
 *
 * Registered from a page under /gigtracker/preview/, so its scope is
 * limited to that subpath -- it can never intercept or cache the live app
 * at /gigtracker/. The cache name is deliberately distinct from the legacy
 * app's ('gigtracker-v3'/'v4') for the same reason.
 *
 * Strategy:
 *  - Navigations and index.html: NETWORK-FIRST (fall back to cache offline).
 *    index.html is not content-hashed, so a cache-first SW would pin the
 *    first deploy a visitor ever saw and no later deploy could reach them
 *    -- exactly how an early broken build left the preview unstyled.
 *  - Everything else (content-hashed JS/CSS/fonts/icons): cache-first. A
 *    hashed URL is immutable, so a hit is never stale.
 *
 * Bump CACHE on every deploy that changes this file so `activate` drops the
 * previous cache instead of accumulating dead hashed entries. */
const CACHE = 'gigtracker-preview-v2';
const PRECACHE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
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

function isNavigation(request) {
  return request.mode === 'navigate' || new URL(request.url).pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (isNavigation(e.request)) {
    // Network-first: a fresh deploy takes effect on the next load.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html'))),
    );
    return;
  }

  // Cache-first for hashed, immutable assets.
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
