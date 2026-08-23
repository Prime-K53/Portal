/*
 * Prime PORTAL service worker.
 *
 * Strategy:
 *   - /api/*            → NETWORK ONLY. Never cached: business data, auth and
 *                         ERP documents must always come from the server.
 *   - navigations        → network-first, fall back to cache, then offline.html
 *   - static assets      → stale-while-revalidate (scripts/styles/images/fonts)
 *
 * Version bump the CACHE_NAME to invalidate everything on deploy.
 */
const CACHE_NAME = 'prime-portal-v1';
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(css|js|mjs|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
  );
}

/** Stale-while-revalidate for same-origin + Google Fonts static assets. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Business data & official documents: ALWAYS the network. No exceptions —
  // invoices/receipts must never be served from a cache.
  if (url.pathname.startsWith('/api/')) return;

  // App navigations: network-first → cache → offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match('/offline.html')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })()
    );
    return;
  }

  // Same-origin static assets + Google Fonts: stale-while-revalidate.
  if (
    isStaticAsset(request) ||
    url.hostname.endsWith('fonts.googleapis.com') ||
    url.hostname.endsWith('fonts.gstatic.com')
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
